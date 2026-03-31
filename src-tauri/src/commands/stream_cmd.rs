use palantir_core::{K8sClient, actions::{exec, logs, events, portforward}};
use palantir_core::models::CrdInfo;
use tauri::{Window, Runtime, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// CRD 캐시 항목: 캐시된 목록과 마지막 조회 시각
pub struct CrdCache {
    pub data: Vec<CrdInfo>,
    pub fetched_at: Instant,
}

impl CrdCache {
    const TTL: Duration = Duration::from_secs(60);

    pub fn is_fresh(&self) -> bool {
        self.fetched_at.elapsed() < Self::TTL
    }
}

pub struct TerminalSession {
    kill_tx: mpsc::Sender<()>,
    input_tx: mpsc::Sender<Vec<u8>>,
}

pub struct SessionManager {
    pub sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
    pub port_forwards: Arc<Mutex<HashMap<u16, CancellationToken>>>,
    pub current_context: Arc<Mutex<Option<String>>>,
    /// CRD 목록 캐시 (60초 TTL, 컨텍스트 전환 시 무효화)
    pub crd_cache: Arc<Mutex<Option<CrdCache>>>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            port_forwards: Arc::new(Mutex::new(HashMap::new())),
            current_context: Arc::new(Mutex::new(None)),
            crd_cache: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub async fn start_event_stream<R: Runtime>(
    window: Window<R>,
    state: State<'_, SessionManager>,
    namespace: Option<String>,
) -> Result<(), String> {
    println!("🚀 [Backend] Starting Event Stream... Namespace: {:?}", namespace);
    let context_name = {
        let guard = state.current_context.lock().unwrap();
        guard.clone()
    };
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let window_clone = window.clone();

    tokio::spawn(async move {
        let (tx, mut rx) = mpsc::channel::<events::K8sEventInfo>(100);
        
        tokio::spawn(async move {
            if let Err(e) = palantir_core::actions::events::stream_events(&client, namespace.as_deref(), move |ev| {
                let _ = tx.try_send(ev);
            }).await {
                println!("❌ [Backend] Event Watcher Error: {:?}", e);
            }
        });
        let mut batch = Vec::new();
        let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(200));

        loop {
            tokio::select! {
                ev = rx.recv() => {
                    if let Some(e) = ev { batch.push(e); } 
                    else { break; }
                }
                _ = interval.tick() => {
                    if !batch.is_empty() {
                        let _ = window_clone.emit("k8s-events-batch", &batch);
                        batch.clear();
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn start_exec<R: Runtime>(
    window: Window<R>,
    state: State<'_, SessionManager>,
    namespace: String,
    pod_name: String,
    container_name: Option<String>,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let context_name = {
        let guard = state.current_context.lock().unwrap();
        guard.clone()
    };
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    
    let mut attached = exec::exec_shell(&client, &namespace, &pod_name, container_name.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    
    let mut stdin = attached.stdin().ok_or("No stdin available")?;
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(100);
    let (kill_tx, mut kill_rx) = mpsc::channel::<()>(1);

    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(session_id.clone(), TerminalSession { kill_tx, input_tx: tx });
    }

    let window_clone = window.clone();
    let sid_for_output = session_id.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                data = rx.recv() => {
                    if let Some(bytes) = data {
                        if stdin.write_all(&bytes).await.is_err() { break; }
                        let _ = stdin.flush().await;
                    } else { break; }
                }
                _ = kill_rx.recv() => { break; }
            }
        }
    });

    tokio::spawn(async move {
        let output_event = format!("session-data-{}", sid_for_output);
        let exit_event = format!("session-exit-{}", sid_for_output);
        let res = exec::stream_exec(attached, move |data| {
            let _ = window_clone.emit(&output_event, data);
        }).await;
        match res {
            Ok(_) => { let _ = window.emit(&exit_event, "normal"); }
            Err(e) => { let _ = window.emit(&exit_event, format!("Error: {}", e)); }
        }
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn write_to_session(
    state: State<'_, SessionManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let tx = {
        let sessions = state.sessions.lock().unwrap();
        sessions.get(&session_id).map(|s| s.input_tx.clone())
    };
    if let Some(tx) = tx {
        tx.send(data.into_bytes()).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_session(
    state: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.remove(&session_id)
    };
    if let Some(session) = session {
        let _ = session.kill_tx.send(()).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn start_logs<R: Runtime>(
    window: Window<R>,
    state: State<'_, SessionManager>,
    namespace: String,
    pod_name: String,
    container_name: Option<String>,
) -> Result<(), String> {
    let context_name = {
        let guard = state.current_context.lock().unwrap();
        guard.clone()
    };
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let window_clone = window.clone();
    let pod_id = format!("{}/{}", namespace, pod_name);

    tokio::spawn(async move {
        let event_name = format!("log-line:{}", pod_id);
        let _ = logs::stream_logs(&client, &namespace, &pod_name, container_name.as_deref(), move |line| {
            let _ = window_clone.emit(&event_name, line);
        }).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn start_port_forward(
    state: State<'_, SessionManager>,
    namespace: String,
    pod_name: String,
    local_port: u16,
    remote_port: u16,
) -> Result<(), String> {
    let context_name = {
        let guard = state.current_context.lock().unwrap();
        guard.clone()
    };
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let token = CancellationToken::new();

    {
        let mut forwards = state.port_forwards.lock().unwrap();
        if forwards.contains_key(&local_port) {
            return Err(format!("Port {} is already in use", local_port));
        }
        forwards.insert(local_port, token.clone());
    }

    let token_clone = token.clone();
    let port_forwards_clone = state.port_forwards.clone();

    tokio::spawn(async move {
        let _ = portforward::start_port_forward(&client, &namespace, &pod_name, local_port, remote_port, token_clone).await;
        let mut forwards = port_forwards_clone.lock().unwrap();
        forwards.remove(&local_port);
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_port_forward(
    state: State<'_, SessionManager>,
    local_port: u16,
) -> Result<(), String> {
    let token = {
        let mut forwards = state.port_forwards.lock().unwrap();
        forwards.remove(&local_port)
    };

    if let Some(t) = token {
        t.cancel();
    }
    Ok(())
}

#[tauri::command]
pub async fn list_port_forwards(
    state: State<'_, SessionManager>,
) -> Result<Vec<u16>, String> {
    let forwards = state.port_forwards.lock().unwrap();
    Ok(forwards.keys().cloned().collect())
}

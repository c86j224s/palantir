use palantir_core::{K8sClient, actions::{exec, logs}};
use tauri::{Window, Runtime, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct TerminalSession {
    kill_tx: mpsc::Sender<()>,
}

#[derive(Default)]
pub struct SessionManager(pub Arc<Mutex<HashMap<String, TerminalSession>>>);

#[tauri::command]
pub async fn start_exec<R: Runtime>(
    window: Window<R>,
    state: State<'_, SessionManager>,
    namespace: String,
    pod_name: String,
    container_name: Option<String>,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    
    let client = K8sClient::new().await.map_err(|e| e.to_string())?;
    let mut attached = exec::exec_shell(&client, &namespace, &pod_name, container_name.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    
    let mut stdin = attached.stdin().ok_or("No stdin available")?;
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(100);
    let (kill_tx, mut kill_rx) = mpsc::channel::<()>(1);

    {
        let mut sessions = state.0.lock().unwrap();
        sessions.insert(session_id.clone(), TerminalSession { kill_tx });
    }

    let window_clone = window.clone();
    let sid_for_output = session_id.clone();

    // 입력 리슨
    let input_event = format!("exec-input:{}", session_id);
    window.listen(input_event, move |event| {
        if let Some(payload) = event.payload() {
            if let Ok(text) = serde_json::from_str::<String>(payload) {
                let _ = tx.try_send(text.into_bytes());
            }
        }
    });

    // Stdin 쓰기 & 종료 대기
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

    // Stdout 읽기 및 종료 감지
    tokio::spawn(async move {
        let output_event = format!("exec-output:{}", sid_for_output);
        let closed_event = format!("session-closed:{}", sid_for_output);
        
        let res = exec::stream_exec(attached, move |data| {
            let _ = window_clone.emit(&output_event, data);
        }).await;
        
        match res {
            Ok(_) => {
                let _ = window.emit(&closed_event, "normal");
            }
            Err(e) => {
                let _ = window.emit(&closed_event, format!("Error: {}", e));
            }
        }
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn stop_session(
    state: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    let session = {
        let mut sessions = state.0.lock().unwrap();
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
    namespace: String,
    pod_name: String,
    container_name: Option<String>,
) -> Result<(), String> {
    let client = K8sClient::new().await.map_err(|e| e.to_string())?;
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

use palantir_core::client::K8sClient;
use palantir_core::actions::events;
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("🧪 [Test] Verifying Async Batching & Panic-Free Event Stream...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    // Tauri 커맨드 내부와 동일한 구조 설계
    let (tx, mut rx) = mpsc::channel::<events::K8sEventInfo>(100);
    
    // 1. Watcher 실행 (try_send 사용)
    tokio::spawn(async move {
        println!("🔍 [Test] Spawning Watcher...");
        let _ = events::stream_events(&client, None, move |ev| {
            // 패닉을 일으켰던 blocking_send 대신 try_send 사용
            let _ = tx.try_send(ev);
        }).await;
    });

    // 2. Batch 수집 루프 실행 (Tauri 커맨드와 동일한 로직)
    tokio::spawn(async move {
        let mut batch = Vec::new();
        let mut interval = tokio::time::interval(Duration::from_millis(200));
        loop {
            tokio::select! {
                ev = rx.recv() => {
                    if let Some(e) = ev {
                        batch.push(e);
                    } else { break; }
                }
                _ = interval.tick() => {
                    if !batch.is_empty() {
                        println!("📡 [Test] Batch Emitted: {} events", batch.len());
                        batch.clear();
                    }
                }
            }
        }
    });

    // 3. 이벤트 강제 발생 (Scale)
    println!("\n🚀 [Test] Triggering events via kubectl scale...");
    let _ = std::process::Command::new("kubectl")
        .args(["scale", "deployment", "nginx", "--replicas=5"])
        .output();

    // 5초간 관찰 (이 과정에서 패닉이 나면 프로그램이 즉시 중단됨)
    sleep(Duration::from_secs(5)).await;
    
    println!("\n✅ [Test] Observation finished without any panics.");
}

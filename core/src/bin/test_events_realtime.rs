use palantir_core::client::K8sClient;
use palantir_core::actions::events;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("🧪 [Test] Verifying Real-time Event Capture...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    // 백라운드에서 이벤트 스트리밍 시작
    tokio::spawn(async move {
        println!("📡 [Test] Watching events (Global)...");
        let _ = events::stream_events(&client, None, |ev| {
            println!("🔥 [Test] Captured: [{}] {} - {}/{}", ev.type_, ev.reason, ev.object_kind, ev.object_name);
        }).await;
    });

    // 2초 대기 후 강제로 이벤트 발생시키기 (Scale 명령)
    sleep(Duration::from_secs(2)).await;
    println!("\n🚀 [Test] Triggering a scale event for deployment/nginx...");
    
    let output = std::process::Command::new("kubectl")
        .args(["scale", "deployment", "nginx", "--replicas=2"])
        .output()
        .expect("Failed to run kubectl");
    
    if output.status.success() {
        println!("✅ [Test] Scale command sent. Waiting for events to arrive (5s)...");
    } else {
        println!("❌ [Test] Failed to trigger event via kubectl: {}", String::from_utf8_lossy(&output.stderr));
    }

    // 5초간 이벤트 관찰
    sleep(Duration::from_secs(5)).await;
    println!("\n🏁 [Test] Observation finished.");
}

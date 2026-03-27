use palantir_core::client::K8sClient;
use palantir_core::actions::logs;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("Testing K8sClient Log Streaming...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    // busybox 파드 이름 하드코딩 (kind 테스트 환경)
    let namespace = "test-ns";
    let pod_name = "busybox";

    println!("Attempting to stream logs from {}/{}", namespace, pod_name);
    
    let result = logs::stream_logs(&client, namespace, pod_name, None, |line| {
        println!("LOG: {}", line);
    }).await;

    match result {
        Ok(_) => println!("✅ Log stream completed normally (or pod has no more logs)."),
        Err(e) => println!("❌ Log stream error: {:?}", e),
    }
}

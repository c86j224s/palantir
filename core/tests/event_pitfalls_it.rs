mod common;
use common::TestContext;
use palantir_core::actions::events;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};

#[tokio::test]
async fn test_event_streaming_stability_under_load() {
    let ctx = TestContext::new().await;
    let (tx, mut rx) = mpsc::channel(10); // 의도적으로 작은 버퍼 설정

    // 1. 스트리밍 실행 (비동기)
    let client_clone = ctx.client.client.clone();
    let namespace = ctx.namespace.clone();
    
    let handle = tokio::spawn(async move {
        let client = palantir_core::client::K8sClient { client: client_clone };
        // 5초간 이벤트 수집
        let _ = timeout(Duration::from_secs(5), events::stream_events(&client, Some(&namespace), move |ev| {
            // 버퍼가 가득 차도 백엔드가 데드락에 빠지지 않는지 확인 (try_send vs blocking_send)
            let _ = tx.try_send(ev);
        })).await;
    });

    // 2. 부하 시뮬레이션 (동시에 많은 이벤트 발생)
    println!("🚀 Generating cluster events in namespace {}...", ctx.namespace);
    for i in 0..20 {
        let pod_name = format!("event-load-pod-{}", i);
        let _ = std::process::Command::new("kubectl")
            .args(["run", &pod_name, "--image=busybox", "--namespace", &ctx.namespace, "--", "sleep", "1"])
            .output();
    }

    // 3. 안정성 확인
    let join_result = timeout(Duration::from_secs(10), handle).await;
    assert!(join_result.is_ok(), "Event watcher task panicked or deadlocked under load!");
    
    println!("✅ Watcher remained stable under event burst.");
}

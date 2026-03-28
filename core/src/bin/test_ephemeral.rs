use palantir_core::client::K8sClient;
use palantir_core::resources::pod;
use k8s_openapi::api::core::v1::Pod;
use kube::{Api, ResourceExt};
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("🧪 [Test] Verifying Ephemeral Container Injection...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    // 테스트용 파드 이름
    let pod_name = "env-test-pod";
    let namespace = "default";
    let debug_container_name = format!("palantir-it-{}", &uuid::Uuid::new_v4().to_string()[..5]);

    println!("Injecting 'busybox' as an ephemeral container into {}...", pod_name);
    match pod::add_ephemeral_container(&client, namespace, pod_name, "busybox:latest", &debug_container_name).await {
        Ok(_) => println!("✅ Injection API call successful!"),
        Err(e) => {
            println!("❌ Injection failed: {:?}", e);
            // 권한 부족이나 클러스터 버전 문제일 수 있음
            return;
        }
    }

    // 주입 후 상태 확인을 위해 약간 대기
    println!("Waiting for container to be registered...");
    sleep(Duration::from_secs(3)).await;

    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    let p = pods.get(pod_name).await.expect("Failed to get pod");
    
    // Ephemeral Containers 목록 확인
    if let Some(spec) = p.spec {
        if let Some(ephemerals) = spec.ephemeral_containers {
            let found = ephemerals.iter().any(|c| c.name == debug_container_name);
            if found {
                println!("✅ Verified: '{}' found in pod spec!", debug_container_name);
            } else {
                println!("❌ Verification failed: Container not found in spec.");
            }
        } else {
            println!("❌ Verification failed: No ephemeral containers in spec.");
        }
    }
}

use palantir_core::client::K8sClient;
use palantir_core::resources::pod;

#[tokio::main]
async fn main() {
    println!("Testing K8sClient connection...");
    match K8sClient::new().await {
        Ok(client) => {
            println!("✅ Successfully initialized K8sClient!");
            
            // test-ns 네임스페이스의 파드 목록 조회 시도
            match pod::list_pods(&client, Some("test-ns")).await {
                Ok(pods) => {
                    println!("✅ Successfully retrieved pods from 'test-ns':");
                    for p in pods {
                        println!("   - Pod: {} | Status: {} | Node: {}", p.name, p.status, p.node);
                    }
                },
                Err(e) => println!("❌ Failed to list pods: {:?}", e),
            }
        },
        Err(e) => {
            println!("❌ Failed to initialize K8sClient: {:?}", e);
        }
    }
}

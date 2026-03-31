use palantir_core::client::K8sClient;
use palantir_core::resources::generic;
use kube::core::GroupVersionKind;

#[tokio::main]
async fn main() {
    println!("Testing Pod Environment Variables in YAML...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    // Pod의 GVK 정의
    let pod_gvk = GroupVersionKind::gvk("", "v1", "Pod");

    println!("Fetching YAML for 'env-test-pod' in 'default' namespace...");
    match generic::get_resource_yaml(&client, "default", &pod_gvk, "env-test-pod", "Namespaced", None).await {
        Ok(yaml) => {
            println!("✅ Successfully retrieved YAML");
            
            // 환경 변수가 포함되어 있는지 문자열 검사
            if yaml.contains("APP_MODE") && yaml.contains("production") {
                println!("✅ Found Environment Variable 'APP_MODE=production' in YAML!");
            } else {
                println!("❌ Environment variables NOT found in YAML output!");
                println!("--- Full YAML ---");
                println!("{}", yaml);
            }
        },
        Err(e) => println!("❌ YAML retrieval failed: {:?}", e),
    }
}

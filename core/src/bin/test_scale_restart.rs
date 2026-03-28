use palantir_core::client::K8sClient;
use palantir_core::resources::generic;
use kube::core::GroupVersionKind;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("Testing Generic Resource Scale and Restart...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    // Deployment GVK
    let deploy_gvk = GroupVersionKind::gvk("apps", "v1", "Deployment");
    let test_name = "nginx"; // Initialized in Phase 1
    let namespace = "default";

    println!("1. Fetching current state of Deployment '{}'...", test_name);
    // Note: We need a way to get the object to check initial generation. 
    // For now, we'll assume it exists and just perform the actions.

    println!("\n2. Scaling Deployment '{}' to 5 replicas...", test_name);
    match generic::scale_resource_generic(&client, namespace, &deploy_gvk, test_name, 5).await {
        Ok(gen) => println!("✅ Scale Success! New Generation: {}", gen),
        Err(e) => println!("❌ Scale failed: {:?}", e),
    }

    sleep(Duration::from_secs(1)).await;

    println!("\n3. Triggering Rollout Restart for '{}'...", test_name);
    match generic::restart_resource_generic(&client, namespace, &deploy_gvk, test_name).await {
        Ok(gen) => println!("✅ Restart Success! New Generation: {}", gen),
        Err(e) => println!("❌ Restart failed: {:?}", e),
    }
}

use palantir_core::client::K8sClient;
use palantir_core::resources::generic;
use kube::core::GroupVersionKind;

#[tokio::main]
async fn main() {
    println!("Testing Generic Resource Engine...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    // ConfigMap의 GVK 정의
    let configmap_gvk = GroupVersionKind::gvk("", "v1", "ConfigMap");

    println!("1. Listing ConfigMaps in 'default' namespace...");
    match generic::list_resources_generic(&client, "default", &configmap_gvk).await {
        Ok(list) => {
            println!("✅ Successfully listed {} ConfigMaps", list.len());
            for item in &list {
                println!("   - Name: {}", item.name);
            }
            
            if let Some(first) = list.first() {
                println!("\n2. Getting YAML for '{}'...", first.name);
                match generic::get_resource_yaml(&client, "default", &configmap_gvk, &first.name).await {
                    Ok(yaml) => {
                        println!("✅ Successfully retrieved YAML ({} chars)", yaml.len());
                        println!("--- YAML Snippet ---");
                        println!("{}", &yaml[..200.min(yaml.len())]);
                    },
                    Err(e) => println!("❌ YAML retrieval failed: {:?}", e),
                }
            }
        },
        Err(e) => println!("❌ List failed: {:?}", e),
    }
}

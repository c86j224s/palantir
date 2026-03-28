use palantir_core::client::K8sClient;
use palantir_core::resources::generic;
use kube::core::GroupVersionKind;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("Testing Generic Resource Apply and Delete...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    // ConfigMap의 GVK 정의
    let configmap_gvk = GroupVersionKind::gvk("", "v1", "ConfigMap");
    let test_cm_name = "palantir-test-cm";
    let namespace = "default";

    let yaml_content = format!(r#"
apiVersion: v1
kind: ConfigMap
metadata:
  name: {}
  namespace: {}
data:
  key1: "value1"
  status: "testing"
"#, test_cm_name, namespace);

    println!("1. Applying ConfigMap '{}'...", test_cm_name);
    match generic::apply_resource_yaml(&client, namespace, &configmap_gvk, test_cm_name, &yaml_content).await {
        Ok(_) => println!("✅ Successfully applied ConfigMap!"),
        Err(e) => {
            println!("❌ Apply failed: {:?}", e);
            return;
        }
    }

    // 약간 대기
    sleep(Duration::from_secs(1)).await;

    println!("\n2. Verifying Creation via get_resource_yaml...");
    match generic::get_resource_yaml(&client, namespace, &configmap_gvk, test_cm_name).await {
        Ok(yaml) => {
            if yaml.contains("testing") {
                println!("✅ Verified: ConfigMap exists and contains correct data.");
            } else {
                println!("❌ Verification failed: Content mismatch.");
            }
        },
        Err(e) => println!("❌ Verification failed: Could not get resource: {:?}", e),
    }

    println!("\n3. Deleting ConfigMap '{}'...", test_cm_name);
    match generic::delete_resource_generic(&client, namespace, &configmap_gvk, test_cm_name).await {
        Ok(_) => println!("✅ Successfully issued delete command!"),
        Err(e) => println!("❌ Delete failed: {:?}", e),
    }

    // 약간 대기
    sleep(Duration::from_secs(2)).await;

    println!("\n4. Verifying Deletion...");
    match generic::get_resource_yaml(&client, namespace, &configmap_gvk, test_cm_name).await {
        Ok(_) => println!("❌ Verification failed: ConfigMap still exists!"),
        Err(_) => println!("✅ Verified: ConfigMap is gone (404 Not Found as expected)."),
    }
}

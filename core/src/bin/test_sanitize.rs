use palantir_core::client::K8sClient;
use palantir_core::resources::generic;
use kube::core::GroupVersionKind;

#[tokio::main]
async fn main() {
    println!("Verifying Sanitize Logic (managedFields removal)...");
    let client = K8sClient::new().await.expect("Failed to init client");
    let cm_gvk = GroupVersionKind::gvk("", "v1", "ConfigMap");
    let name = "sanitize-test-cm";

    // managedFields와 uid가 포함된 문제의 YAML 시뮬레이션
    let dirty_yaml = format!(r#"
apiVersion: v1
kind: ConfigMap
metadata:
  name: {}
  namespace: default
  uid: "some-old-uid"
  resourceVersion: "12345"
  managedFields:
  - manager: kubectl
    operation: Update
data:
  content: "sanitized"
"#, name);

    println!("Applying 'dirty' YAML (should succeed after sanitization)...");
    match generic::apply_resource_yaml(&client, "default", &cm_gvk, name, &dirty_yaml, "Namespaced", None).await {
        Ok(_) => println!("✅ Successfully applied! Sanitization logic works."),
        Err(e) => {
            println!("❌ Apply failed: {:?}", e);
            panic!("Sanitization failed to remove forbidden fields!");
        }
    }

    // 정리
    let _ = generic::delete_resource_generic(&client, "default", &cm_gvk, name, "Namespaced", None).await;
}

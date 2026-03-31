mod common;
use common::TestContext;
use palantir_core::resources::generic;
use kube::core::GroupVersionKind;

#[tokio::test]
async fn test_pod_lifecycle_and_environment_manipulation() {
    let ctx = TestContext::new().await;
    let pod_name = "lifecycle-test-pod";
    let pod_gvk = GroupVersionKind::gvk("", "v1", "Pod");

    // 1. Create Pod with Initial Env
    let yaml = format!(r#"
apiVersion: v1
kind: Pod
metadata:
  name: {}
spec:
  containers:
  - name: main
    image: busybox:latest
    command: ["sleep", "3600"]
    env:
    - name: TEST_KEY
      value: "initial-value"
"#, pod_name);

    println!("🚀 Applying initial pod configuration...");
    generic::apply_resource_yaml(&ctx.client, &ctx.namespace, &pod_gvk, pod_name, &yaml, "Namespaced", None).await.expect("Failed to apply pod");

    // 2. Wait for Running state
    println!("⏳ Waiting for pod to reach Running state (timeout 60s)...");
    let is_running = ctx.wait_for_pod_running(pod_name, 60).await;
    assert!(is_running, "Pod failed to reach Running state within timeout");

    // 3. Verify Env via YAML retrieval
    println!("🔍 Verifying environment variables via generic engine...");
    let retrieved_yaml = generic::get_resource_yaml(&ctx.client, &ctx.namespace, &pod_gvk, pod_name, "Namespaced", None).await.expect("Failed to get yaml");
    assert!(retrieved_yaml.contains("initial-value"), "YAML did not contain expected environment value");

    // 4. Test Negative Scenario: Modification of Immutable Field
    let modified_yaml = yaml.replace("initial-value", "changed-value");
    println!("🚫 Attempting to modify immutable pod field (expecting error)...");
    let result = generic::apply_resource_yaml(&ctx.client, &ctx.namespace, &pod_gvk, pod_name, &modified_yaml, "Namespaced", None).await;
    
    assert!(result.is_err(), "Pod modification should have failed due to immutability but succeeded!");
    let err_msg = result.err().unwrap().to_string();
    println!("✅ Immutability enforcement verified: {}", err_msg);

    // 5. Clean up
    println!("✨ Lifecycle test completed successfully!");
}

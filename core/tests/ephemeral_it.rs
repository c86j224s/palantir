mod common;
use common::TestContext;
use palantir_core::resources::{pod, generic};
use kube::core::GroupVersionKind;
use tokio::time::{sleep, Duration};

#[tokio::test]
async fn test_ephemeral_container_lifecycle_and_drain_logic() {
    let ctx = TestContext::new().await;
    let pod_name = "ephemeral-test-pod";
    let pod_gvk = GroupVersionKind::gvk("", "v1", "Pod");
    let debug_container_name = "debug-shell";

    // 1. Create a Pod
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
"#, pod_name);

    println!("🚀 Creating pod for ephemeral test...");
    generic::apply_resource_yaml(&ctx.client, &ctx.namespace, &pod_gvk, pod_name, &yaml)
        .await.expect("Failed to create pod");

    assert!(ctx.wait_for_pod_running(pod_name, 60).await, "Pod failed to reach Running state");

    // 2. Add Ephemeral Container
    println!("🧪 Injecting ephemeral container...");
    pod::add_ephemeral_container(
        &ctx.client, 
        &ctx.namespace, 
        pod_name, 
        "busybox:latest", 
        debug_container_name
    ).await.expect("Failed to inject ephemeral container");

    // 3. Verify via list_pods (exercises PodInfo mapping)
    println!("🔍 Verifying container info via list_pods...");
    let pods = pod::list_pods(&ctx.client, Some(&ctx.namespace))
        .await.expect("Failed to list pods");
    
    let target_pod = pods.iter().find(|p| p.name == pod_name).expect("Pod not found in list");
    let ec_info = target_pod.ephemeral_containers.iter().find(|ec| ec.name == debug_container_name)
        .expect("Ephemeral container not found in PodInfo");
    
    assert_eq!(ec_info.state, "Running", "Ephemeral container should be Running");

    // 4. Terminate Ephemeral Container (exercises drain logic added in last commit)
    println!("🛑 Terminating ephemeral container...");
    pod::terminate_ephemeral_container(
        &ctx.client,
        &ctx.namespace,
        pod_name,
        debug_container_name
    ).await.expect("Failed to terminate container");

    // 5. Verify Termination state
    println!("⏳ Waiting for container to reflect Terminated state...");
    let mut terminated = false;
    for _ in 0..10 {
        let pods = pod::list_pods(&ctx.client, Some(&ctx.namespace)).await.unwrap();
        let p = pods.iter().find(|p| p.name == pod_name).unwrap();
        let ec = p.ephemeral_containers.iter().find(|ec| ec.name == debug_container_name).unwrap();
        if ec.state == "Terminated" {
            terminated = true;
            break;
        }
        sleep(Duration::from_secs(1)).await;
    }
    assert!(terminated, "Ephemeral container failed to reach Terminated state");

    println!("✨ Ephemeral lifecycle and drain logic verified successfully!");
}

mod common;
use common::TestContext;
use palantir_core::resources::generic;
use kube::core::GroupVersionKind;

#[tokio::test]
async fn test_resource_manipulation_pitfalls() {
    let ctx = TestContext::new().await;
    let cm_gvk = GroupVersionKind::gvk("", "v1", "ConfigMap");
    let deploy_gvk = GroupVersionKind::gvk("apps", "v1", "Deployment");

    // 1. 존재하지 않는 리소스 삭제 시도 시의 방어력
    println!("🔍 Testing deletion of non-existent resource...");
    let result = generic::delete_resource_generic(&ctx.client, &ctx.namespace, &cm_gvk, "non-existent-cm").await;
    
    // K8s API는 404를 리턴해야 하며, 우리 백엔드는 이를 에러로 우아하게 잡아야 함
    assert!(result.is_err(), "Deleting non-existent resource should return an error");
    println!("✅ Correctly handled non-existent deletion: {:?}", result.err().unwrap());

    // 2. 음수 리플리카 수 조절 시도 (K8s 제약 조건 확인)
    // Deployment 생성
    let deploy_name = "scale-pitfall-test";
    let yaml = format!(r#"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test
  template:
    metadata:
      labels:
        app: test
    spec:
      containers:
      - name: main
        image: nginx:alpine
"#, deploy_name);

    generic::apply_resource_yaml(&ctx.client, &ctx.namespace, &deploy_gvk, deploy_name, &yaml).await.expect("Setup failed");

    println!("🔍 Testing scaling to negative replicas (-1)...");
    let scale_result = generic::scale_resource_generic(&ctx.client, &ctx.namespace, &deploy_gvk, deploy_name, -1).await;
    
    assert!(scale_result.is_err(), "Scaling to negative replicas should be forbidden by API schema");
    println!("✅ Correctly rejected negative scale: {:?}", scale_result.err().unwrap());
}

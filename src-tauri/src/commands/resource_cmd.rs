use palantir_core::{K8sClient, resources::{pod, namespace, deployment, service, generic}, models::{PodInfo, ResourceInfo}};
use kube::core::GroupVersionKind;

#[tauri::command]
pub async fn get_pods(namespace: Option<String>) -> Result<Vec<PodInfo>, String> {
    let client = K8sClient::new().await.map_err(|e| e.to_string())?;
    pod::list_pods(&client, namespace.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_namespaces() -> Result<Vec<String>, String> {
    let client = K8sClient::new().await.map_err(|e| e.to_string())?;
    namespace::list_namespaces(&client).await.map_err(|e| e.to_string())
}

// 범용 리소스 조회 커맨드
#[tauri::command]
pub async fn get_resources_generic(
    namespace: String,
    group: String,
    version: String,
    kind: String,
) -> Result<Vec<ResourceInfo>, String> {
    let client = K8sClient::new().await.map_err(|e| e.to_string())?;
    let gvk = GroupVersionKind::gvk(&group, &version, &kind);
    generic::list_resources_generic(&client, &namespace, &gvk)
        .await
        .map_err(|e| e.to_string())
}

// 리소스 YAML 조회 커맨드
#[tauri::command]
pub async fn get_resource_yaml(
    namespace: String,
    group: String,
    version: String,
    kind: String,
    name: String,
) -> Result<String, String> {
    let client = K8sClient::new().await.map_err(|e| e.to_string())?;
    let gvk = GroupVersionKind::gvk(&group, &version, &kind);
    generic::get_resource_yaml(&client, &namespace, &gvk, &name)
        .await
        .map_err(|e| e.to_string())
}

// 기존 커맨드들 유지
#[tauri::command]
pub async fn get_deployments(namespace: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    let client = K8sClient::new().await.map_err(|e| e.to_string())?;
    deployment::list_deployments(&client, namespace.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_services(namespace: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    let client = K8sClient::new().await.map_err(|e| e.to_string())?;
    service::list_services(&client, namespace.as_deref()).await.map_err(|e| e.to_string())
}

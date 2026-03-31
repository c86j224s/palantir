use palantir_core::{K8sClient, resources::{pod, namespace, deployment, service, generic}, models::{PodInfo, ResourceInfo}, config::ContextInfo};
use kube::core::GroupVersionKind;
use tauri::State;
use crate::commands::stream_cmd::SessionManager;

// 컨텍스트 목록 조회 커맨드
#[tauri::command]
pub async fn get_contexts() -> Result<Vec<ContextInfo>, String> {
    palantir_core::config::get_available_contexts().map_err(|e| e.to_string())
}

// 컨텍스트 전환 커맨드
#[tauri::command]
pub async fn switch_context(
    state: State<'_, SessionManager>,
    context_name: String,
) -> Result<(), String> {
    let mut current = state.current_context.lock().unwrap();
    *current = Some(context_name);
    Ok(())
}

// 파드에 디버깅용 Ephemeral Container 주입 커맨드
#[tauri::command]
pub async fn inject_debug_container(
    state: State<'_, SessionManager>,
    namespace: String,
    pod_name: String,
    image: String,
) -> Result<String, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let container_name = format!("palantir-debug-{}", &uuid::Uuid::new_v4().to_string()[..5]);
    
    palantir_core::resources::pod::add_ephemeral_container(
        &client, &namespace, &pod_name, &image, &container_name
    ).await.map_err(|e| e.to_string())?;
    
    Ok(container_name)
}

// 정적 로그 조회 커맨드 (종료된 파드용)
#[tauri::command]
pub async fn get_static_logs(
    state: State<'_, SessionManager>,
    namespace: String,
    pod_name: String,
    container_name: Option<String>,
) -> Result<String, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    palantir_core::actions::logs::read_static_logs(&client, &namespace, &pod_name, container_name.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// 연결 상태 진단 커맨드
#[tauri::command]
pub async fn get_connection_info(
    state: State<'_, SessionManager>,
) -> Result<palantir_core::client::ConnectionInfo, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let (config, meta) = palantir_core::client::K8sClient::get_config_internal(context_name).await.map_err(|e| e.to_string())?;
    
    Ok(palantir_core::client::ConnectionInfo {
        cluster_url: config.cluster_url.to_string(),
        current_context: meta.current_context.unwrap_or_default(),
        kubeconfig_path: meta.path,
        insecure_skip_tls: config.accept_invalid_certs,
    })
}

#[tauri::command]
pub async fn get_pod_detail(
    state: State<'_, SessionManager>,
    namespace: String,
    pod_name: String,
) -> Result<PodInfo, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let pods = pod::list_pods(&client, Some(&namespace)).await.map_err(|e| e.to_string())?;
    pods.into_iter().find(|p| p.name == pod_name).ok_or_else(|| "Pod not found".to_string())
}

// 임시 컨테이너 종료
#[tauri::command]
pub async fn terminate_debug_container(
    state: State<'_, SessionManager>,
    namespace: String,
    pod_name: String,
    container_name: String,
) -> Result<(), String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    pod::terminate_ephemeral_container(&client, &namespace, &pod_name, &container_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_pods(
    state: State<'_, SessionManager>,
    namespace: Option<String>
) -> Result<Vec<PodInfo>, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    pod::list_pods(&client, namespace.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_namespaces(
    state: State<'_, SessionManager>,
) -> Result<Vec<String>, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    namespace::list_namespaces(&client).await.map_err(|e| e.to_string())
}

// 범용 리소스 조회 커맨드
#[tauri::command]
pub async fn get_resources_generic(
    state: State<'_, SessionManager>,
    namespace: String,
    group: String,
    version: String,
    kind: String,
) -> Result<Vec<ResourceInfo>, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let gvk = GroupVersionKind::gvk(&group, &version, &kind);
    generic::list_resources_generic(&client, &namespace, &gvk)
        .await
        .map_err(|e| e.to_string())
}

// 리소스 YAML 조회 커맨드
#[tauri::command]
pub async fn get_resource_yaml(
    state: State<'_, SessionManager>,
    namespace: String,
    group: String,
    version: String,
    kind: String,
    name: String,
) -> Result<String, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let gvk = GroupVersionKind::gvk(&group, &version, &kind);
    generic::get_resource_yaml(&client, &namespace, &gvk, &name)
        .await
        .map_err(|e| e.to_string())
}

// 리소스 YAML 수정 반영(Apply) 커맨드
#[tauri::command]
pub async fn apply_resource_yaml(
    state: State<'_, SessionManager>,
    namespace: String,
    group: String,
    version: String,
    kind: String,
    name: String,
    yaml_content: String,
) -> Result<(), String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let gvk = GroupVersionKind::gvk(&group, &version, &kind);
    generic::apply_resource_yaml(&client, &namespace, &gvk, &name, &yaml_content)
        .await
        .map_err(|e| e.to_string())
}

// 리소스 삭제 커맨드
#[tauri::command]
pub async fn delete_resource_generic(
    state: State<'_, SessionManager>,
    namespace: String,
    group: String,
    version: String,
    kind: String,
    name: String,
) -> Result<(), String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let gvk = GroupVersionKind::gvk(&group, &version, &kind);
    generic::delete_resource_generic(&client, &namespace, &gvk, &name)
        .await
        .map_err(|e| e.to_string())
}

// 리소스 스케일 조절 커맨드
#[tauri::command]
pub async fn scale_resource(
    state: State<'_, SessionManager>,
    namespace: String,
    group: String,
    version: String,
    kind: String,
    name: String,
    replicas: i32,
) -> Result<i64, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let gvk = GroupVersionKind::gvk(&group, &version, &kind);
    generic::scale_resource_generic(&client, &namespace, &gvk, &name, replicas)
        .await
        .map_err(|e| e.to_string())
}

// 리소스 재시작(Rollout Restart) 커맨드
#[tauri::command]
pub async fn restart_resource(
    state: State<'_, SessionManager>,
    namespace: String,
    group: String,
    version: String,
    kind: String,
    name: String,
) -> Result<i64, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    let gvk = GroupVersionKind::gvk(&group, &version, &kind);
    generic::restart_resource_generic(&client, &namespace, &gvk, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_deployments(
    state: State<'_, SessionManager>,
    namespace: Option<String>
) -> Result<Vec<ResourceInfo>, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    deployment::list_deployments(&client, namespace.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_services(
    state: State<'_, SessionManager>,
    namespace: Option<String>
) -> Result<Vec<ResourceInfo>, String> {
    let context_name = state.current_context.lock().unwrap().clone();
    let client = K8sClient::new_with_context(context_name).await.map_err(|e| e.to_string())?;
    service::list_services(&client, namespace.as_deref()).await.map_err(|e| e.to_string())
}

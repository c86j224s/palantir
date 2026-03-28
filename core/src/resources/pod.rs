use kube::{Api, api::{ListParams, Patch, PatchParams, AttachedProcess, AttachParams}};
use k8s_openapi::api::core::v1::Pod;
use crate::models::{PodInfo, EphemeralContainerInfo};
use crate::client::K8sClient;
use crate::actions::exec;

pub async fn list_pods(client: &K8sClient, namespace: Option<&str>) -> Result<Vec<PodInfo>, kube::Error> {
    let namespace = namespace.unwrap_or("default");
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    
    let pod_list = pods.list(&ListParams::default()).await?;
    
    let result = pod_list.into_iter().map(|p| {
        let status = p.status.as_ref().and_then(|s| s.phase.clone()).unwrap_or_else(|| "Unknown".to_string());
        let node = p.spec.as_ref().and_then(|s| s.node_name.clone()).unwrap_or_else(|| "N/A".to_string());
        
        // Ephemeral Container 정보 추출
        let mut ephemerals = Vec::new();
        if let Some(spec) = &p.spec {
            if let Some(e_containers) = &spec.ephemeral_containers {
                for ec in e_containers {
                    let name = ec.name.clone();
                    let image = ec.image.clone().unwrap_or_default();
                    let mut state = "Waiting".to_string();
                    
                    if let Some(st) = &p.status {
                        if let Some(e_statuses) = &st.ephemeral_container_statuses {
                            if let Some(cs) = e_statuses.iter().find(|s| s.name == name) {
                                if let Some(cs_state) = &cs.state {
                                    if cs_state.running.is_some() { state = "Running".to_string(); }
                                    else if cs_state.terminated.is_some() { state = "Terminated".to_string(); }
                                }
                            }
                        }
                    }
                    ephemerals.push(EphemeralContainerInfo { name, image, state });
                }
            }
        }

        PodInfo {
            name: p.metadata.name.clone().unwrap_or_default(),
            namespace: p.metadata.namespace.clone().unwrap_or_default(),
            status,
            node,
            creation_timestamp: p.metadata.creation_timestamp.as_ref().map(|t| t.0),
            ephemeral_containers: ephemerals,
        }
    }).collect();
    
    Ok(result)
}

pub async fn add_ephemeral_container(
    client: &K8sClient,
    namespace: &str,
    pod_name: &str,
    image: &str,
    container_name: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    
    let current_pod = pods.get(pod_name).await?;
    let ephemeral_list = current_pod.spec
        .and_then(|s| s.ephemeral_containers)
        .unwrap_or_default();

    let new_container = serde_json::json!({
        "name": container_name,
        "image": image,
        "command": ["sh", "-c", "sleep 3600"], 
        "stdin": true,
        "tty": true,
        "imagePullPolicy": "Always"
    });
    
    let new_container_val: serde_json::Value = serde_json::from_value(new_container)?;
    
    let mut patch_list: Vec<serde_json::Value> = ephemeral_list.into_iter()
        .map(|c| serde_json::to_value(c).unwrap())
        .collect();
    patch_list.push(new_container_val);

    let patch = serde_json::json!({
        "apiVersion": "v1",
        "kind": "Pod",
        "spec": {
            "ephemeralContainers": patch_list
        }
    });

    let pp = PatchParams::apply("palantir").force();
    pods.patch_subresource("ephemeralcontainers", pod_name, &pp, &Patch::Apply(&patch)).await?;
    
    for _ in 0..20 {
        let p = pods.get(pod_name).await?;
        if let Some(status) = p.status {
            if let Some(e_statuses) = status.ephemeral_container_statuses {
                if let Some(c_status) = e_statuses.iter().find(|s| s.name == container_name) {
                    if let Some(state) = &c_status.state {
                        if state.running.is_some() {
                            return Ok(());
                        }
                        if let Some(waiting) = &state.waiting {
                            let reason = waiting.reason.as_deref().unwrap_or("Unknown");
                            if reason == "ErrImagePull" || reason == "ImagePullBackOff" {
                                return Err(format!("이미지 풀 실패: {}", reason).into());
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }
    
    Err("컨테이너 기동 타임아웃".into())
}

pub async fn terminate_ephemeral_container(
    client: &K8sClient,
    namespace: &str,
    pod_name: &str,
    container_name: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // exec를 통해 kill 1 명령을 내려 프로세스 종료 유도
    println!("🛑 [Backend] Terminating container {} in pod {}...", container_name, pod_name);
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    
    let ap = AttachParams {
        container: Some(container_name.to_string()),
        stdin: false,
        stdout: true,
        stderr: true,
        tty: false,
        max_stdin_buf_size: Some(1024),
        max_stdout_buf_size: Some(1024),
        max_stderr_buf_size: Some(1024),
    };

    // 프로세스 종료 시도 (sh -c kill 1)
    let _ = pods.exec(pod_name, vec!["sh", "-c", "kill 1"], &ap).await?;
    
    Ok(())
}

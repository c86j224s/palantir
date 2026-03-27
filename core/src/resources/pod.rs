use kube::{Api, api::ListParams};
use k8s_openapi::api::core::v1::Pod;
use crate::models::PodInfo;
use crate::client::K8sClient;

pub async fn list_pods(client: &K8sClient, namespace: Option<&str>) -> Result<Vec<PodInfo>, kube::Error> {
    let namespace = namespace.unwrap_or("default");
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    
    let pod_list = pods.list(&ListParams::default()).await?;
    
    let result = pod_list.into_iter().map(|p| {
        let status = p.status.as_ref().and_then(|s| s.phase.clone()).unwrap_or_else(|| "Unknown".to_string());
        let node = p.spec.as_ref().and_then(|s| s.node_name.clone()).unwrap_or_else(|| "N/A".to_string());
        
        PodInfo {
            name: p.metadata.name.clone().unwrap_or_default(),
            namespace: p.metadata.namespace.clone().unwrap_or_default(),
            status,
            node,
            creation_timestamp: p.metadata.creation_timestamp.as_ref().map(|t| t.0),
        }
    }).collect();
    
    Ok(result)
}

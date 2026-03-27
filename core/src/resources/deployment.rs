use kube::{Api, api::ListParams};
use k8s_openapi::api::apps::v1::Deployment;
use crate::models::ResourceInfo;
use crate::client::K8sClient;

pub async fn list_deployments(client: &K8sClient, namespace: Option<&str>) -> Result<Vec<ResourceInfo>, kube::Error> {
    let namespace = namespace.unwrap_or("default");
    let api: Api<Deployment> = Api::namespaced(client.client.clone(), namespace);
    
    let list = api.list(&ListParams::default()).await?;
    
    let result = list.into_iter().map(|d| {
        let replicas = d.status.as_ref().map(|s| format!("{}/{}", s.ready_replicas.unwrap_or(0), s.replicas.unwrap_or(0))).unwrap_or_else(|| "0/0".to_string());
        
        ResourceInfo {
            name: d.metadata.name.clone().unwrap_or_default(),
            namespace: d.metadata.namespace.clone().unwrap_or_default(),
            kind: "Deployment".to_string(),
            status: replicas,
            creation_timestamp: d.metadata.creation_timestamp.as_ref().map(|t| t.0),
        }
    }).collect();
    
    Ok(result)
}

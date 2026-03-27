use kube::{Api, api::ListParams};
use k8s_openapi::api::core::v1::Service;
use crate::models::ResourceInfo;
use crate::client::K8sClient;

pub async fn list_services(client: &K8sClient, namespace: Option<&str>) -> Result<Vec<ResourceInfo>, kube::Error> {
    let namespace = namespace.unwrap_or("default");
    let api: Api<Service> = Api::namespaced(client.client.clone(), namespace);
    
    let list = api.list(&ListParams::default()).await?;
    
    let result = list.into_iter().map(|s| {
        let type_str = s.spec.as_ref().and_then(|spec| spec.type_.clone()).unwrap_or_else(|| "ClusterIP".to_string());
        let cluster_ip = s.spec.as_ref().and_then(|spec| spec.cluster_ip.clone()).unwrap_or_else(|| "None".to_string());
        
        ResourceInfo {
            name: s.metadata.name.clone().unwrap_or_default(),
            namespace: s.metadata.namespace.clone().unwrap_or_default(),
            kind: "Service".to_string(),
            status: format!("{}({})", type_str, cluster_ip),
            creation_timestamp: s.metadata.creation_timestamp.as_ref().map(|t| t.0),
        }
    }).collect();
    
    Ok(result)
}

use kube::{Api, api::{ListParams, DynamicObject, ApiResource}, ResourceExt, core::GroupVersionKind};
use crate::client::K8sClient;
use crate::models::ResourceInfo;

pub async fn list_resources_generic(
    client: &K8sClient,
    namespace: &str,
    gvk: &GroupVersionKind,
) -> Result<Vec<ResourceInfo>, Box<dyn std::error::Error + Send + Sync>> {
    let ar = ApiResource::from_gvk(gvk);
    let api: Api<DynamicObject> = Api::namespaced_with(client.client.clone(), namespace, &ar);
    let list = api.list(&ListParams::default()).await?;
    
    let result = list.into_iter().map(|obj| {
        ResourceInfo {
            name: obj.name_any(),
            namespace: obj.namespace().unwrap_or_default(),
            kind: obj.types.as_ref().map(|t| t.kind.clone()).unwrap_or_default(),
            status: "Active".to_string(),
            creation_timestamp: obj.metadata.creation_timestamp.map(|t| t.0),
        }
    }).collect();
    
    Ok(result)
}

pub async fn get_resource_yaml(
    client: &K8sClient,
    namespace: &str,
    gvk: &GroupVersionKind,
    name: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let ar = ApiResource::from_gvk(gvk);
    let api: Api<DynamicObject> = Api::namespaced_with(client.client.clone(), namespace, &ar);
    let obj = api.get(name).await?;
    
    let yaml = serde_yaml::to_string(&obj)?;
    Ok(yaml)
}

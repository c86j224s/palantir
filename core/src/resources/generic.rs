use kube::{Api, api::{ListParams, DynamicObject, ApiResource, Patch, PatchParams}, ResourceExt, core::GroupVersionKind};
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
        let mut status = "Active".to_string();
        
        // Job 전용 상태 파싱
        if obj.types.as_ref().map(|t| &t.kind) == Some(&"Job".to_string()) {
            if let Some(s) = obj.data.get("status") {
                if s.get("succeeded").and_then(|v| v.as_i64()).unwrap_or(0) > 0 {
                    status = "Completed".to_string();
                } else if s.get("failed").and_then(|v| v.as_i64()).unwrap_or(0) > 0 {
                    status = "Failed".to_string();
                }
            }
        }

        ResourceInfo {
            name: obj.name_any(),
            namespace: obj.namespace().unwrap_or_default(),
            kind: obj.types.as_ref().map(|t| t.kind.clone()).unwrap_or_default(),
            status,
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

pub async fn apply_resource_yaml(
    client: &K8sClient,
    namespace: &str,
    gvk: &GroupVersionKind,
    name: &str,
    yaml_content: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ar = ApiResource::from_gvk(gvk);
    let api: Api<DynamicObject> = Api::namespaced_with(client.client.clone(), namespace, &ar);
    
    let mut patch_value: serde_json::Value = serde_yaml::from_str(yaml_content)?;

    if let Some(metadata) = patch_value.get_mut("metadata") {
        if let Some(map) = metadata.as_object_mut() {
            map.remove("managedFields");
            map.remove("uid");
            map.remove("resourceVersion");
            map.remove("generation");
            map.remove("creationTimestamp");
            map.remove("selfLink");
        }
    }
    
    let patch_obj: DynamicObject = serde_json::from_value(patch_value)?;
    let pp = PatchParams::apply("palantir").force();
    api.patch(name, &pp, &Patch::Apply(&patch_obj)).await?;
    
    Ok(())
}

pub async fn scale_resource_generic(
    client: &K8sClient,
    namespace: &str,
    gvk: &GroupVersionKind,
    name: &str,
    replicas: i32,
) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
    let ar = ApiResource::from_gvk(gvk);
    let api: Api<DynamicObject> = Api::namespaced_with(client.client.clone(), namespace, &ar);
    
    let pp = PatchParams::default();
    let patch = serde_json::json!({
        "spec": { "replicas": replicas }
    });
    
    let result = api.patch_scale(name, &pp, &Patch::Merge(&patch)).await?;
    Ok(result.metadata.generation.unwrap_or(0))
}

pub async fn restart_resource_generic(
    client: &K8sClient,
    namespace: &str,
    gvk: &GroupVersionKind,
    name: &str,
) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
    let ar = ApiResource::from_gvk(gvk);
    let api: Api<DynamicObject> = Api::namespaced_with(client.client.clone(), namespace, &ar);
    
    let now = chrono::Utc::now().to_rfc3339();
    let patch = serde_json::json!({
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "kubectl.kubernetes.io/restartedAt": now
                    }
                }
            }
        }
    });
    
    let pp = PatchParams::default();
    let result = api.patch(name, &pp, &Patch::Strategic(&patch)).await?;
    Ok(result.metadata.generation.unwrap_or(0))
}

pub async fn delete_resource_generic(
    client: &K8sClient,
    namespace: &str,
    gvk: &GroupVersionKind,
    name: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ar = ApiResource::from_gvk(gvk);
    let api: Api<DynamicObject> = Api::namespaced_with(client.client.clone(), namespace, &ar);
    
    let mut dp = kube::api::DeleteParams::default();
    dp.propagation_policy = Some(kube::api::PropagationPolicy::Background);
    
    api.delete(name, &dp).await?;
    Ok(())
}

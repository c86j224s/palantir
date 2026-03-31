use kube::{Api, api::{ListParams, DynamicObject, ApiResource, Patch, PatchParams}, ResourceExt, core::GroupVersionKind};
use crate::client::K8sClient;
use crate::models::ResourceInfo;

/// scope와 plural을 고려하여 ApiResource를 생성합니다.
/// plural 이 Some이면 CRD의 spec.names.plural을 사용하고,
/// None이면 kube-rs의 from_gvk (kind.to_lowercase()+"s" 규칙)을 사용합니다.
fn make_api_resource(gvk: &GroupVersionKind, plural: Option<&str>) -> ApiResource {
    match plural {
        Some(p) => ApiResource {
            group: gvk.group.clone(),
            version: gvk.version.clone(),
            api_version: if gvk.group.is_empty() {
                gvk.version.clone()
            } else {
                format!("{}/{}", gvk.group, gvk.version)
            },
            kind: gvk.kind.clone(),
            plural: p.to_string(),
        },
        None => ApiResource::from_gvk(gvk),
    }
}

/// scope에 따라 Namespaced 또는 Cluster-scoped API를 생성합니다.
fn make_dynamic_api(
    client: kube::Client,
    namespace: &str,
    ar: &ApiResource,
    scope: &str,
) -> Api<DynamicObject> {
    if scope == "Cluster" {
        Api::all_with(client, ar)
    } else {
        Api::namespaced_with(client, namespace, ar)
    }
}

pub async fn list_resources_generic(
    client: &K8sClient,
    namespace: &str,
    gvk: &GroupVersionKind,
    scope: &str,
    plural: Option<&str>,
) -> Result<Vec<ResourceInfo>, Box<dyn std::error::Error + Send + Sync>> {
    let ar = make_api_resource(gvk, plural);
    let api = make_dynamic_api(client.client.clone(), namespace, &ar, scope);
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
    scope: &str,
    plural: Option<&str>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let ar = make_api_resource(gvk, plural);
    let api = make_dynamic_api(client.client.clone(), namespace, &ar, scope);
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
    scope: &str,
    plural: Option<&str>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ar = make_api_resource(gvk, plural);
    let api = make_dynamic_api(client.client.clone(), namespace, &ar, scope);

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
    scope: &str,
    plural: Option<&str>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ar = make_api_resource(gvk, plural);
    let api = make_dynamic_api(client.client.clone(), namespace, &ar, scope);

    let mut dp = kube::api::DeleteParams::default();
    dp.propagation_policy = Some(kube::api::PropagationPolicy::Background);

    api.delete(name, &dp).await?;
    Ok(())
}

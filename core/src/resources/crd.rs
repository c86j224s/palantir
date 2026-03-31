use kube::{Api, api::{ListParams, DynamicObject, ApiResource}};
use kube::core::GroupVersionKind;
use crate::client::K8sClient;
use crate::models::CrdInfo;

/// 클러스터에 설치된 모든 CRD를 조회합니다.
/// CRD는 cluster-scoped 리소스이므로 Api::all_with 를 사용합니다.
/// served:false 버전은 제외하고, storage:true 버전을 기본값으로 선택합니다.
pub async fn list_crds(
    client: &K8sClient,
) -> Result<Vec<CrdInfo>, Box<dyn std::error::Error + Send + Sync>> {
    let gvk = GroupVersionKind::gvk("apiextensions.k8s.io", "v1", "CustomResourceDefinition");
    let ar = ApiResource::from_gvk(&gvk);
    let api: Api<DynamicObject> = Api::all_with(client.client.clone(), &ar);
    let list = api.list(&ListParams::default()).await?;

    let mut result: Vec<CrdInfo> = list
        .into_iter()
        .filter_map(|obj| parse_crd_object(&obj))
        .collect();

    // group + kind 알파벳 순 정렬 (사이드바 표시 시 안정적 순서)
    result.sort_by(|a, b| a.group.cmp(&b.group).then(a.kind.cmp(&b.kind)));
    Ok(result)
}

/// DynamicObject로 표현된 CRD 메타데이터를 CrdInfo로 파싱합니다.
/// 순수 함수로 분리하여 단위 테스트에서 클러스터 없이 검증 가능합니다.
pub fn parse_crd_object(obj: &DynamicObject) -> Option<CrdInfo> {
    let spec = obj.data.get("spec")?;

    let group = spec.get("group")?.as_str()?.to_string();
    let kind = spec.get("names")?.get("kind")?.as_str()?.to_string();
    let plural = spec.get("names")?.get("plural")?.as_str()?.to_string();
    let scope = spec
        .get("scope")?
        .as_str()
        .unwrap_or("Namespaced")
        .to_string();

    let versions_raw = spec.get("versions")?.as_array()?;

    // served:true 인 버전만 사용 가능한 버전으로 취급
    let served_versions: Vec<&serde_json::Value> = versions_raw
        .iter()
        .filter(|v| v.get("served").and_then(|s| s.as_bool()).unwrap_or(true))
        .collect();

    if served_versions.is_empty() {
        return None;
    }

    // storage:true 버전이 기본 선택값. 없으면 첫 번째 served 버전 사용.
    let version = served_versions
        .iter()
        .find(|v| v.get("storage").and_then(|s| s.as_bool()).unwrap_or(false))
        .and_then(|v| v.get("name")?.as_str().map(String::from))
        .unwrap_or_else(|| {
            served_versions[0]
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string()
        });

    // storage 버전을 맨 앞에, 나머지 served 버전을 뒤에 정렬
    let mut versions: Vec<String> = served_versions
        .iter()
        .filter_map(|v| v.get("name")?.as_str().map(String::from))
        .collect();
    if let Some(pos) = versions.iter().position(|v| v == &version) {
        versions.remove(pos);
        versions.insert(0, version.clone());
    }

    let name = format!("{}.{}", plural, group);

    Some(CrdInfo {
        name,
        group,
        kind,
        plural,
        scope,
        version,
        versions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use kube::api::ApiResource as KubeApiResource;
    use serde_json::json;

    fn mock_crd(
        kind: &str,
        group: &str,
        scope: &str,
        versions: Vec<(&str, bool, bool)>, // (name, served, storage)
    ) -> DynamicObject {
        let versions_arr: Vec<serde_json::Value> = versions
            .iter()
            .map(|(name, served, storage)| {
                json!({ "name": name, "served": served, "storage": storage })
            })
            .collect();

        let ar = KubeApiResource {
            group: "apiextensions.k8s.io".into(),
            version: "v1".into(),
            api_version: "apiextensions.k8s.io/v1".into(),
            kind: "CustomResourceDefinition".into(),
            plural: "customresourcedefinitions".into(),
        };
        let plural = format!("{}s", kind.to_lowercase());
        let mut obj = DynamicObject::new("", &ar);
        obj.metadata.name = Some(format!("{}.{}", plural, group));
        obj.data["spec"] = json!({
            "group": group,
            "names": { "kind": kind, "plural": &plural },
            "scope": scope,
            "versions": versions_arr,
        });
        obj
    }

    #[test]
    fn test_단일_버전_파싱() {
        let obj = mock_crd("Foo", "example.com", "Namespaced", vec![("v1", true, true)]);
        let info = parse_crd_object(&obj).unwrap();
        assert_eq!(info.kind, "Foo");
        assert_eq!(info.group, "example.com");
        assert_eq!(info.version, "v1");
        assert_eq!(info.scope, "Namespaced");
        assert_eq!(info.plural, "foos");
    }

    #[test]
    fn test_storage_버전이_기본값으로_선택됨() {
        // v1alpha1 이 storage 버전일 때 기본값으로 선택되어야 함
        let obj = mock_crd(
            "Bar",
            "test.io",
            "Cluster",
            vec![("v1beta1", true, false), ("v1alpha1", true, true)],
        );
        let info = parse_crd_object(&obj).unwrap();
        assert_eq!(info.version, "v1alpha1");
        assert_eq!(info.versions[0], "v1alpha1", "storage 버전이 목록 맨 앞이어야 함");
        assert_eq!(info.versions.len(), 2);
    }

    #[test]
    fn test_served_false_버전은_제외됨() {
        let obj = mock_crd(
            "Baz",
            "test.io",
            "Namespaced",
            vec![
                ("v1alpha1", false, false), // served:false — 제외되어야 함
                ("v1", true, true),
            ],
        );
        let info = parse_crd_object(&obj).unwrap();
        assert_eq!(info.version, "v1");
        assert_eq!(info.versions.len(), 1, "served:false 버전은 제외되어야 함");
    }

    #[test]
    fn test_모든_버전이_served_false면_None_반환() {
        let obj = mock_crd(
            "Empty",
            "test.io",
            "Namespaced",
            vec![("v1", false, true)], // storage지만 served:false
        );
        assert!(parse_crd_object(&obj).is_none(), "사용 가능한 버전이 없으면 None이어야 함");
    }

    #[test]
    fn test_버전_목록_없으면_None_반환() {
        let ar = KubeApiResource {
            group: "apiextensions.k8s.io".into(),
            version: "v1".into(),
            api_version: "apiextensions.k8s.io/v1".into(),
            kind: "CustomResourceDefinition".into(),
            plural: "customresourcedefinitions".into(),
        };
        let mut obj = DynamicObject::new("empty.test.io", &ar);
        obj.data["spec"] = json!({
            "group": "test.io",
            "names": { "kind": "Empty", "plural": "empties" },
            "scope": "Namespaced",
            "versions": [],
        });
        assert!(parse_crd_object(&obj).is_none());
    }

    #[test]
    fn test_cluster_scope_파싱() {
        let obj = mock_crd(
            "ClusterPolicy",
            "policy.io",
            "Cluster",
            vec![("v1", true, true)],
        );
        let info = parse_crd_object(&obj).unwrap();
        assert_eq!(info.scope, "Cluster");
    }
}

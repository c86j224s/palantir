use kube::{Api, api::{ListParams}};
use k8s_openapi::api::core::v1::Secret;
use serde::{Serialize, Deserialize};
use std::io::Read;
use flate2::read::GzDecoder;
use base64::{prelude::BASE64_STANDARD, Engine};
use crate::client::K8sClient;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HelmRelease {
    pub name: String,
    pub namespace: String,
    pub version: i32,
    pub status: String,
    pub info: HelmReleaseInfo,
    pub chart: HelmChart,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HelmReleaseInfo {
    pub first_deployed: String,
    pub last_deployed: String,
    pub deleted: String,
    pub description: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HelmChart {
    pub metadata: HelmChartMeta,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HelmChartMeta {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub api_version: String,
    pub app_version: Option<String>,
}

pub async fn list_releases(client: &K8sClient, namespace: Option<&str>) -> anyhow::Result<Vec<HelmRelease>> {
    let secrets: Api<Secret> = match namespace {
        Some(ns) => Api::namespaced(client.client.clone(), ns),
        None => Api::all(client.client.clone()),
    };

    let lp = ListParams::default().labels("owner=helm");
    let secret_list = secrets.list(&lp).await?;
    
    let mut releases = Vec::new();
    for s in secret_list.items {
        if let Some(data) = s.data {
            if let Some(rel_data) = data.get("release") {
                if let Ok(release) = decode_release(&rel_data.0) {
                    // 목록 조회 시에는 대용량 manifest 필드는 비워서 전송 (성능 최적화)
                    let mut rel = release;
                    rel.manifest = None;
                    releases.push(rel);
                }
            }
        }
    }

    // 최신 리비전 순으로 정렬
    releases.sort_by(|a, b| b.version.cmp(&a.version));
    Ok(releases)
}

pub async fn get_manifest(client: &K8sClient, namespace: &str, release_name: &str, revision: i32) -> anyhow::Result<String> {
    let secrets: Api<Secret> = Api::namespaced(client.client.clone(), namespace);
    let secret_name = format!("sh.helm.release.v1.{}.v{}", release_name, revision);
    
    let s = secrets.get(&secret_name).await?;
    if let Some(data) = s.data {
        if let Some(rel_data) = data.get("release") {
            let release = decode_release(&rel_data.0)?;
            return Ok(release.manifest.unwrap_or_default());
        }
    }
    
    Err(anyhow::anyhow!("Release manifest not found"))
}

fn decode_release(data: &[u8]) -> anyhow::Result<HelmRelease> {
    // 1. Base64 Decode
    let decoded = BASE64_STANDARD.decode(data)?;
    // 2. Gzip Unzip
    let mut decoder = GzDecoder::new(&decoded[..]);
    let mut json_str = String::new();
    decoder.read_to_string(&mut json_str)?;
    // 3. JSON Parse
    let release: HelmRelease = serde_json::from_str(&json_str)?;
    Ok(release)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;

    #[test]
    fn test_helm_release_decoding() {
        // 1. Mock Data 생성
        let mock_json = r#"{
            "name": "test-app",
            "namespace": "default",
            "version": 1,
            "status": "deployed",
            "info": {
                "first_deployed": "2026-03-31",
                "last_deployed": "2026-03-31",
                "deleted": "",
                "description": "Install complete",
                "status": "deployed"
            },
            "chart": {
                "metadata": {
                    "name": "nginx",
                    "version": "1.0.0",
                    "api_version": "v2"
                }
            },
            "manifest": "apiVersion: v1\nkind: Pod\nmetadata:\n  name: nginx"
        }"#;

        // 2. Gzip 압축
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(mock_json.as_bytes()).unwrap();
        let compressed = encoder.finish().unwrap();

        // 3. Base64 인코딩
        let encoded = BASE64_STANDARD.encode(&compressed);

        // 4. 로직 검증 (decode_release 호출)
        let result = decode_release(encoded.as_bytes()).expect("Decoding failed");

        assert_eq!(result.name, "test-app");
        assert_eq!(result.chart.metadata.name, "nginx");
        assert!(result.manifest.unwrap().contains("kind: Pod"));
        println!("✅ Helm release decoding logic verified!");
    }
}

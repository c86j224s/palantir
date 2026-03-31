use palantir_core::client::K8sClient;
use palantir_core::resources::{crd, generic};
use kube::core::GroupVersionKind;

#[tokio::main]
async fn main() {
    println!("Testing CRD Discovery...");
    let client = K8sClient::new().await.expect("Failed to init client");

    println!("1. Listing all CRDs in cluster...");
    match crd::list_crds(&client).await {
        Ok(crds) => {
            println!("✅ Found {} CRDs", crds.len());
            for c in &crds {
                println!(
                    "   - {} ({}.{}) | version: {} | scope: {} | all_versions: {:?}",
                    c.kind, c.plural, c.group, c.version, c.scope, c.versions
                );
            }

            // CRD가 없는 클러스터도 정상 처리 확인
            if crds.is_empty() {
                println!("✅ Empty CRD list handled correctly (no CRDs installed)");
                return;
            }

            // Namespaced CRD가 있으면 인스턴스 목록 조회 테스트
            if let Some(ns_crd) = crds.iter().find(|c| c.scope == "Namespaced") {
                println!("\n2. Listing instances of '{}' in 'default' namespace...", ns_crd.kind);
                let gvk = GroupVersionKind::gvk(&ns_crd.group, &ns_crd.version, &ns_crd.kind);
                match generic::list_resources_generic(
                    &client, "default", &gvk, "Namespaced", Some(&ns_crd.plural)
                ).await {
                    Ok(items) => println!("✅ Found {} instances of {}", items.len(), ns_crd.kind),
                    Err(e) => {
                        let err_str = e.to_string();
                        if err_str.contains("Forbidden") || err_str.contains("403") {
                            println!("⚠️  RBAC 권한 없음 (정상 시나리오): {}", e);
                        } else {
                            println!("⚠️  인스턴스 조회 실패 (빈 네임스페이스일 수 있음): {}", e);
                        }
                    }
                }
            }

            // Cluster-scoped CRD가 있으면 전체 인스턴스 목록 조회 테스트
            if let Some(cluster_crd) = crds.iter().find(|c| c.scope == "Cluster") {
                println!("\n3. Listing cluster-scoped instances of '{}'...", cluster_crd.kind);
                let gvk = GroupVersionKind::gvk(&cluster_crd.group, &cluster_crd.version, &cluster_crd.kind);
                match generic::list_resources_generic(
                    &client, "", &gvk, "Cluster", Some(&cluster_crd.plural)
                ).await {
                    Ok(items) => println!("✅ Found {} cluster-scoped instances of {}", items.len(), cluster_crd.kind),
                    Err(e) => {
                        let err_str = e.to_string();
                        if err_str.contains("Forbidden") || err_str.contains("403") {
                            println!("⚠️  RBAC 권한 없음 (정상 시나리오): {}", e);
                        } else {
                            println!("⚠️  인스턴스 조회 실패: {}", e);
                        }
                    }
                }
            }
        }
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("Forbidden") || err_str.contains("403") {
                println!("⚠️  RBAC 권한 없음 - CRD 목록 조회에는 cluster-admin 권한이 필요합니다: {}", e);
            } else {
                println!("❌ CRD 목록 조회 실패: {}", e);
                std::process::exit(1);
            }
        }
    }
}

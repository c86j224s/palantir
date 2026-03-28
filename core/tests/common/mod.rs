use palantir_core::client::K8sClient;
use kube::{Api, api::PostParams};
use k8s_openapi::api::core::v1::Namespace;
use tokio::time::{sleep, Duration};
use uuid::Uuid;

pub struct TestContext {
    pub client: K8sClient,
    pub namespace: String,
}

impl TestContext {
    pub async fn new() -> Self {
        let client = K8sClient::new().await.expect("Failed to init client");
        let ns_name = format!("palantir-it-{}", &Uuid::new_v4().to_string()[..8]);
        
        let ns_api: Api<Namespace> = Api::all(client.client.clone());
        let ns = Namespace {
            metadata: kube::api::ObjectMeta {
                name: Some(ns_name.clone()),
                ..Default::default()
            },
            ..Default::default()
        };
        
        println!("🏗️  Creating isolated namespace: {}", ns_name);
        ns_api.create(&PostParams::default(), &ns).await.expect("Failed to create test namespace");
        
        Self { client, namespace: ns_name }
    }

    pub async fn wait_for_pod_running(&self, pod_name: &str, timeout_secs: u64) -> bool {
        use k8s_openapi::api::core::v1::Pod;
        let pods: Api<Pod> = Api::namespaced(self.client.client.clone(), &self.namespace);
        
        for _ in 0..timeout_secs {
            if let Ok(p) = pods.get(pod_name).await {
                if let Some(status) = p.status {
                    if status.phase == Some("Running".to_string()) {
                        return true;
                    }
                }
            }
            sleep(Duration::from_secs(1)).await;
        }
        false
    }
}

impl Drop for TestContext {
    fn drop(&mut self) {
        println!("🧹 Cleaning up isolated namespace: {}", self.namespace);
    }
}

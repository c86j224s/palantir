use kube::{Api, api::LogParams};
use k8s_openapi::api::core::v1::Pod;
use futures::{io::AsyncBufReadExt, TryStreamExt};
use crate::client::K8sClient;

pub async fn stream_logs<F>(
    client: &K8sClient,
    namespace: &str,
    pod_name: &str,
    container_name: Option<&str>,
    mut on_log: F,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> 
where 
    F: FnMut(String) + Send + 'static
{
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    let lp = LogParams {
        container: container_name.map(|s| s.to_string()),
        follow: true,
        tail_lines: Some(100),
        ..Default::default()
    };
    
    let logs = pods.log_stream(pod_name, &lp).await?;
    let mut reader = logs.lines();
    
    while let Some(line) = reader.try_next().await? {
        on_log(line);
    }
    
    Ok(())
}

pub async fn read_static_logs(
    client: &K8sClient,
    namespace: &str,
    pod_name: &str,
    container_name: Option<&str>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    let lp = LogParams {
        container: container_name.map(|s| s.to_string()),
        follow: false,
        tail_lines: Some(1000),
        ..Default::default()
    };
    
    let logs = pods.logs(pod_name, &lp).await?;
    Ok(logs)
}

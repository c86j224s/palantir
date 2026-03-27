use kube::{Api, api::ListParams};
use k8s_openapi::api::core::v1::Namespace;
use crate::client::K8sClient;

pub async fn list_namespaces(client: &K8sClient) -> Result<Vec<String>, kube::Error> {
    let api: Api<Namespace> = Api::all(client.client.clone());
    let list = api.list(&ListParams::default()).await?;
    
    Ok(list.into_iter().map(|ns| ns.metadata.name.clone().unwrap_or_default()).collect())
}

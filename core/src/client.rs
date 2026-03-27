use kube::{Client, Config};
use crate::config::resolve_kubeconfig;

#[derive(thiserror::Error, Debug)]
pub enum ClientError {
    #[error("Config resolution error: {0}")]
    Config(#[from] crate::config::ConfigError),
    #[error("Kube config error: {0}")]
    KubeConfig(#[from] kube::config::KubeconfigError),
    #[error("Kube client error: {0}")]
    Kube(#[from] kube::Error),
}

pub struct K8sClient {
    pub client: Client,
}

impl K8sClient {
    pub async fn new() -> Result<Self, ClientError> {
        let config_path = resolve_kubeconfig()?;
        let kubeconfig = kube::config::Kubeconfig::read_from(config_path)?;
        let config = Config::from_custom_kubeconfig(
            kubeconfig,
            &kube::config::KubeConfigOptions::default(),
        ).await?;
        
        let client = Client::try_from(config)?;
        Ok(Self { client })
    }

    pub async fn try_default() -> Result<Self, ClientError> {
        let client = Client::try_default().await?;
        Ok(Self { client })
    }
}

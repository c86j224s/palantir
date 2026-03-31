use kube::{Client, Config};
use crate::config::resolve_kubeconfig;
use serde::Serialize;

#[derive(thiserror::Error, Debug)]
pub enum ClientError {
    #[error("Config resolution error: {0}")]
    Config(#[from] crate::config::ConfigError),
    #[error("Kube config error: {0}")]
    KubeConfig(#[from] kube::config::KubeconfigError),
    #[error("Kube client error: {0}")]
    Kube(#[from] kube::Error),
    #[error("Context Error: {0}")]
    Context(String),
}

#[derive(Serialize)]
pub struct ConnectionInfo {
    pub cluster_url: String,
    pub current_context: String,
    pub kubeconfig_path: String,
    pub insecure_skip_tls: bool,
}

pub struct K8sClient {
    pub client: Client,
}

impl K8sClient {
    pub async fn new() -> Result<Self, ClientError> {
        Self::new_with_context(None).await
    }

    pub async fn new_with_context(context_name: Option<String>) -> Result<Self, ClientError> {
        let (config, _) = Self::get_config_internal(context_name).await?;
        let client = Client::try_from(config)?;
        Ok(Self { client })
    }

    pub async fn get_info() -> Result<ConnectionInfo, ClientError> {
        let (config, meta) = Self::get_config_internal(None).await?;
        Ok(ConnectionInfo {
            cluster_url: config.cluster_url.to_string(),
            current_context: meta.current_context.unwrap_or_default(),
            kubeconfig_path: meta.path,
            insecure_skip_tls: config.accept_invalid_certs,
        })
    }

    pub async fn get_config_internal(context_name: Option<String>) -> Result<(Config, ConfigMeta), ClientError> {
        let config_path = resolve_kubeconfig()?;
        let path_str = config_path.to_string_lossy().to_string();
        let mut kubeconfig = kube::config::Kubeconfig::read_from(&config_path)?;
        
        if let Some(target_ctx) = context_name {
            kubeconfig.current_context = Some(target_ctx);
        }
        
        let mut current_context = kubeconfig.current_context.clone();

        if cfg!(target_os = "windows") {
            if current_context.is_none() || current_context.as_deref() == Some("") {
                if let Some(first_ctx) = kubeconfig.contexts.first() {
                    current_context = Some(first_ctx.name.clone());
                    kubeconfig.current_context = current_context.clone();
                }
            }

            for cluster in kubeconfig.clusters.iter_mut() {
                if let Some(c) = &mut cluster.cluster {
                    if let Some(server) = &c.server {
                        if server.contains("localhost") {
                            c.server = Some(server.replace("localhost", "127.0.0.1"));
                        }
                    }
                }
            }
        }

        let mut config = Config::from_custom_kubeconfig(
            kubeconfig,
            &kube::config::KubeConfigOptions::default(),
        ).await?;
        
        if cfg!(target_os = "windows") {
            config.accept_invalid_certs = true;
        }
        
        Ok((config, ConfigMeta { path: path_str, current_context }))
    }

    pub async fn try_default() -> Result<Self, ClientError> {
        let client = Client::try_default().await?;
        Ok(Self { client })
    }
}

pub struct ConfigMeta {
    pub path: String,
    pub current_context: Option<String>,
}

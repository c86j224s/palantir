use std::path::PathBuf;
use std::env;

#[derive(thiserror::Error, Debug)]
pub enum ConfigError {
    #[error("Kubeconfig not found in standard locations")]
    NotFound,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub fn resolve_kubeconfig() -> Result<PathBuf, ConfigError> {
    println!("🔍 Searching for kubeconfig...");

    if let Ok(val) = env::var("KUBECONFIG") {
        let path = PathBuf::from(val);
        if path.exists() {
            println!("   ✅ Found at KUBECONFIG env var");
            return Ok(path);
        }
    }

    if let Some(mut path) = dirs::home_dir() {
        path.push(".kube");
        path.push("config");
        if path.exists() {
            println!("   ✅ Found at default path (~/.kube/config)");
            return Ok(path);
        }
    }

    println!("   ❌ No kubeconfig found!");
    Err(ConfigError::NotFound)
}

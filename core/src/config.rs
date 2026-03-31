use std::env;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Kubeconfig not found. Searched paths: {0}")]
    NotFound(String),
    #[error("IO Error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Unknown Error: {0}")]
    Unknown(String),
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct ContextInfo {
    pub name: String,
    pub cluster: String,
    pub user: String,
    pub is_current: bool,
}

pub fn resolve_kubeconfig() -> Result<PathBuf, ConfigError> {
    let mut searched_paths = Vec::new();

    // 1. KUBECONFIG 환경변수 확인 (최우선)
    if let Ok(val) = env::var("KUBECONFIG") {
        let path = PathBuf::from(val);
        if path.exists() { return Ok(path); }
        searched_paths.push(format!("ENV:{}", path.display()));
    }

    // 2. [Windows 전용] WSL2 경로 선제 탐색 (Palantir 전용 브릿지 모드)
    #[cfg(target_os = "windows")]
    {
        println!("🚀 [Config] Prioritizing WSL2 bridge search...");
        let distros = vec!["Ubuntu", "Ubuntu-22.04", "Ubuntu-20.04", "debian"];
        let roots = vec![r"\\wsl.localhost", r"\\wsl$"];
        let wsl_user = "cjs"; 

        for root in &roots {
            for distro in &distros {
                let wsl_path = PathBuf::from(format!(
                    r#"{}\{}\home\{}\.kube\config"#,
                    root, distro, wsl_user
                ));
                if wsl_path.exists() {
                    println!("✅ [Config] WSL2 Config Hooked!");
                    return Ok(wsl_path);
                }
                searched_paths.push(wsl_path.to_string_lossy().into_owned());
            }
        }
    }

    // 3. 마지막으로 윈도우 네이티브 홈 경로 확인
    if let Some(mut home) = dirs::home_dir() {
        home.push(".kube");
        home.push("config");
        if home.exists() { return Ok(home); }
        searched_paths.push(format!("HOME:{}", home.display()));
    }

    Err(ConfigError::NotFound(searched_paths.join(", ")))
}

pub fn get_available_contexts() -> Result<Vec<ContextInfo>, ConfigError> {
    let config_path = resolve_kubeconfig()?;
    let kubeconfig = kube::config::Kubeconfig::read_from(&config_path)
        .map_err(|e| ConfigError::Unknown(e.to_string()))?;
    
    let current_context = kubeconfig.current_context.clone();
    
    let contexts = kubeconfig.contexts.into_iter().map(|ctx| {
        ContextInfo {
            name: ctx.name.clone(),
            cluster: ctx.context.as_ref().map(|c| c.cluster.clone()).unwrap_or_default(),
            user: ctx.context.as_ref().map(|c| c.user.clone()).unwrap_or_default(),
            is_current: current_context.as_deref() == Some(&ctx.name),
        }
    }).collect();

    Ok(contexts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_parse_available_contexts() {
        let dir = tempdir().unwrap();
        let config_path = dir.path().join("config");
        let mut file = File::create(&config_path).unwrap();
        
        let yaml = r#"
apiVersion: v1
clusters:
- cluster:
    server: https://1.2.3.4
  name: cluster-1
- cluster:
    server: https://5.6.7.8
  name: cluster-2
contexts:
- context:
    cluster: cluster-1
    user: user-1
  name: context-1
- context:
    cluster: cluster-2
    user: user-2
  name: context-2
current-context: context-1
kind: Config
preferences: {}
users:
- name: user-1
- name: user-2
"#;
        file.write_all(yaml.as_bytes()).unwrap();

        // 환경변수 임시 설정으로 resolve_kubeconfig 우회 테스트
        std::env::set_var("KUBECONFIG", config_path.to_str().unwrap());
        
        let contexts = get_available_contexts().unwrap();
        assert_eq!(contexts.len(), 2);
        
        let ctx1 = contexts.iter().find(|c| c.name == "context-1").unwrap();
        assert_eq!(ctx1.cluster, "cluster-1");
        assert!(ctx1.is_current);

        let ctx2 = contexts.iter().find(|c| c.name == "context-2").unwrap();
        assert_eq!(ctx2.cluster, "cluster-2");
        assert!(!ctx2.is_current);
    }
}

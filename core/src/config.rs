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

pub fn resolve_kubeconfig() -> Result<PathBuf, ConfigError> {
    let mut searched_paths = Vec::new();

    // 1. KUBECONFIG 환경변수 확인 (최우선)
    if let Ok(val) = env::var("KUBECONFIG") {
        let path = PathBuf::from(val);
        if path.exists() { return Ok(path); }
        searched_paths.push(format!("ENV:{}", path.display()));
    }

    // 2. [Windows 전용] WSL2 경로 선제 탐색 (Palantir 전용 브릿지 모드)
    // 윈도우 네이티브 설정(.kube/config)보다 WSL2 설정을 먼저 찾도록 순서 변경
    #[cfg(target_os = "windows")]
    {
        println!("🚀 [Config] Prioritizing WSL2 bridge search...");
        let distros = vec!["Ubuntu", "Ubuntu-22.04", "Ubuntu-20.04", "debian"];
        let roots = vec![r"\\wsl.localhost", r"\\wsl$"];
        let wsl_user = "cjs"; // WSL2 내부 사용자명

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

#[cfg(target_os = "windows")]
pub fn bridge_wsl_ip(yaml_content: String) -> String {
    yaml_content.replace("127.0.0.1", "127.0.0.1")
}

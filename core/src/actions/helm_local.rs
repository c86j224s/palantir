use std::process::Command;
use std::path::Path;

pub async fn template_local_chart(
    chart_path: &str,
    values_paths: Vec<String>,
    release_name: Option<&str>,
    namespace: Option<&str>,
) -> anyhow::Result<String> {
    let mut cmd = Command::new("helm");
    cmd.arg("template");

    if let Some(name) = release_name {
        cmd.arg(name);
    } else {
        cmd.arg("preview-release");
    }

    cmd.arg(chart_path);

    for v in values_paths {
        if Path::new(&v).exists() {
            cmd.arg("-f").arg(v);
        }
    }

    if let Some(ns) = namespace {
        cmd.arg("-n").arg(ns);
    }

    let output = cmd.output()?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        Err(anyhow::anyhow!("Helm template failed: {}", err))
    }
}

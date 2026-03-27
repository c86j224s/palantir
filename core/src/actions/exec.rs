use kube::{Api, api::{AttachedProcess, AttachParams, ApiResource}, ResourceExt, core::GroupVersionKind};
use k8s_openapi::api::core::v1::Pod;
use tokio::io::AsyncReadExt;
use crate::client::K8sClient;

pub async fn exec_shell(
    client: &K8sClient,
    namespace: &str,
    pod_name: &str,
    container_name: Option<&str>,
) -> Result<AttachedProcess, kube::Error> {
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    
    let ap = AttachParams {
        container: container_name.map(|s| s.to_string()),
        stdin: true,
        stdout: true,
        stderr: false,
        tty: true,
        ..Default::default()
    };
    
    let attached = pods.exec(
        pod_name,
        vec!["/bin/sh", "-c", "TERM=xterm-256color; export TERM; [ -x /bin/bash ] && exec /bin/bash || exec /bin/sh"],
        &ap
    ).await?;
    
    Ok(attached)
}

pub async fn exec_command(
    client: &K8sClient,
    namespace: &str,
    pod_name: &str,
    container_name: Option<&str>,
    command: Vec<&str>,
) -> Result<AttachedProcess, kube::Error> {
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    
    let ap = AttachParams {
        container: container_name.map(|s| s.to_string()),
        stdin: false,
        stdout: true,
        stderr: true,
        tty: false,
        ..Default::default()
    };
    
    let attached = pods.exec(pod_name, command, &ap).await?;
    Ok(attached)
}

pub async fn stream_exec<F>(
    mut attached: AttachedProcess,
    mut on_output: F,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> 
where 
    F: FnMut(Vec<u8>) + Send + 'static
{
    let mut stdout = attached.stdout().ok_or("No stdout")?;
    let mut stderr = attached.stderr();
    
    let mut out_buffer = [0u8; 1024];
    let mut err_buffer = [0u8; 1024];
    
    loop {
        if let Some(ref mut err) = stderr {
            tokio::select! {
                res = stdout.read(&mut out_buffer) => {
                    let n = res?;
                    if n == 0 { break; }
                    on_output(out_buffer[..n].to_vec());
                }
                res = err.read(&mut err_buffer) => {
                    let n = res?;
                    if n == 0 { break; }
                    on_output(err_buffer[..n].to_vec());
                }
            }
        } else {
            let n = stdout.read(&mut out_buffer).await?;
            if n == 0 { break; }
            on_output(out_buffer[..n].to_vec());
        }
    }
    
    Ok(())
}

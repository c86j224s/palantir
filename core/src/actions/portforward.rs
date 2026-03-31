use kube::Api;
use k8s_openapi::api::core::v1::Pod;
use tokio::net::TcpListener;
use tokio::io::copy_bidirectional;
use std::net::SocketAddr;
use tokio_util::sync::CancellationToken;
use crate::client::K8sClient;

pub async fn start_port_forward(
    client: &K8sClient,
    namespace: &str,
    pod_name: &str,
    local_port: u16,
    remote_port: u16,
    token: CancellationToken, // 강제 종료 대신 토큰 사용
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pods: Api<Pod> = Api::namespaced(client.client.clone(), namespace);
    let mut pf = pods.portforward(pod_name, &[remote_port]).await?;
    
    let addr = SocketAddr::from(([127, 0, 0, 1], local_port));
    let listener = TcpListener::bind(addr).await?;
    println!("🚀 [PortForward] Server bound to http://{}", addr);

    loop {
        tokio::select! {
            // 1. 중단 신호 확인 (최우선 처리)
            _ = token.cancelled() => {
                println!("🛑 [PortForward] Shutdown signal received for port {}", local_port);
                break;
            }
            // 2. 새 연결 수락
            accept_res = listener.accept() => {
                match accept_res {
                    Ok((mut client_stream, _)) => {
                        let pod_stream_opt = pf.take_stream(remote_port);
                        if let Some(mut pod_stream) = pod_stream_opt {
                            let conn_token = token.clone();
                            tokio::spawn(async move {
                                // 데이터 복사 작업도 토큰에 의해 취소될 수 있도록 select 사용
                                tokio::select! {
                                    _ = conn_token.cancelled() => {
                                        println!("🔌 [PortForward] Closing active connection on port {} due to shutdown", local_port);
                                    }
                                    _ = copy_bidirectional(&mut client_stream, &mut pod_stream) => {
                                        // 연결 자연 종료
                                    }
                                }
                            });
                        }
                    }
                    Err(e) => {
                        println!("⚠️ [PortForward] Accept error: {:?}", e);
                        break;
                    }
                }
            }
        }
    }

    // 명시적으로 모든 리소스 해제
    drop(listener);
    drop(pf);
    println!("✅ [PortForward] Port {} successfully released and resources cleaned up.", local_port);
    Ok(())
}

use palantir_core::client::K8sClient;
use palantir_core::actions::exec;
use tokio::io::AsyncWriteExt;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("Testing K8sClient Exec...");
    let client = K8sClient::new().await.expect("Failed to init client");
    
    let namespace = "test-ns";
    let pod_name = "busybox";

    println!("Attempting to exec into {}/{} and send 'exit'...", namespace, pod_name);
    
    match exec::exec_shell(&client, namespace, pod_name, None).await {
        Ok(mut attached) => {
            println!("✅ Successfully attached to pod!");

            if let Some(mut stdin) = attached.stdin() {
                println!("Sending 'exit' command...");
                stdin.write_all(b"exit\n").await.unwrap();
                stdin.flush().await.unwrap();
            }

            println!("Starting output stream and waiting for closure...");
            // stream_exec가 정상 종료(Ok)되는지 확인
            let res = exec::stream_exec(attached, |data| {
                if let Ok(s) = String::from_utf8(data) {
                    print!("{}", s);
                }
            }).await;
            
            match res {
                Ok(_) => println!("\n✅ Backend stream_exec returned Ok(()). Normal exit detected."),
                Err(e) => println!("\n❌ Backend stream_exec returned Err: {:?}", e),
            }
        },
        Err(e) => println!("❌ Exec failed: {:?}", e),
    }
}

mod common;
use palantir_core::config::resolve_kubeconfig;
use std::env;

#[tokio::test]
async fn test_kubeconfig_resolution_pitfalls() {
    // 1. KUBECONFIG 환경 변수가 잘못된 경로를 가리킬 때의 방어력 테스트
    let original_kv = env::var("KUBECONFIG").ok();
    env::set_var("KUBECONFIG", "/non/existent/path/that/really/should/not/exist");
    
    let result = resolve_kubeconfig();
    
    // 환경 변수가 틀려도 패닉이 나지 않고 다음 단계(기본 경로)로 넘어가거나 에러를 리턴해야 함
    match result {
        Ok(path) => {
            println!("✅ Fallback to default path worked: {:?}", path);
            assert!(path.exists(), "Resolved fallback path must exist");
        },
        Err(e) => {
            println!("✅ Correctly handled error: {}", e);
        }
    }

    // 복구
    if let Some(val) = original_kv {
        env::set_var("KUBECONFIG", val);
    } else {
        env::remove_var("KUBECONFIG");
    }
}

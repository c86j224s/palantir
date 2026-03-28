use std::process::Command;
use std::env;
use std::path::Path;

fn main() {
    let target = env::var("TARGET").unwrap_or_default();
    
    if target.contains("windows") {
        // 1. 필수 시스템 라이브러리 명시적 링크
        println!("cargo:rustc-link-lib=comctl32");
        println!("cargo:rustc-link-lib=user32");
        println!("cargo:rustc-link-lib=shell32");
        println!("cargo:rustc-link-lib=ole32");

        // 2. 리소스 파일 변경 감지 설정
        println!("cargo:rerun-if-changed=resources.rc");
        println!("cargo:rerun-if-changed=palantir.exe.manifest");

        // 3. 리눅스에서 윈도우 리소스 직접 컴파일 (Cross-Compile Pro approach)
        // windres를 사용하여 .rc 파일을 COFF 객체(.res)로 변환
        let out_dir = env::var("OUT_DIR").unwrap();
        let res_file = Path::new(&out_dir).join("resources.res");
        
        println!("🚀 [Build] Compiling Windows resources via windres...");
        let status = Command::new("x86_64-w64-mingw32-windres")
            .args(&["resources.rc", "-O", "coff", "-o"])
            .arg(&res_file)
            .status()
            .expect("Failed to run x86_64-w64-mingw32-windres. Ensure binutils-mingw-w64-x86-64 is installed.");

        if status.success() {
            // 컴파일된 리소스 객체를 링커에게 전달 (이것이 가장 확실한 방법입니다)
            println!("cargo:rustc-link-arg={}", res_file.display());
            println!("✅ [Build] Resources successfully embedded.");
        } else {
            panic!("❌ [Build] Failed to compile Windows resources.");
        }
    }

    tauri_build::build()
}

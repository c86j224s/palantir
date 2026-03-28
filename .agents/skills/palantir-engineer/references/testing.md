# Testing & Verification Guide

Palantir 프로젝트에서 "완료"란 테스트 통과를 의미합니다.

## 1. Backend Integration Test
- **위치**: `core/src/bin/*.rs`
- **패턴**:
  ```rust
  #[tokio::main]
  async fn main() {
      let client = K8sClient::new().await.expect("Failed");
      // 리소스 생성/조회/수정/삭제 로직 실행
      // println!으로 결과 데이터 명시적 출력
  }
  ```
- **실행**: `cargo run -p palantir-core --bin <test_name>`

## 2. Frontend Unit Test
- **위치**: `frontend/src/test/*.test.tsx`
- **도구**: `vitest`, `@testing-library/react`
- **핵심**: Tauri API(`invoke`, `listen`, `emit`)를 반드시 모킹(Mock)하여 로직만 독립적으로 검증할 것.
- **실행**: `cd frontend && npx vitest run`

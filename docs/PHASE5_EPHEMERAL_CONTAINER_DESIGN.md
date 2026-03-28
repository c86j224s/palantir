# Palantir Phase 5 - Ephemeral Containers 설계안

## 1. 개요
실행 중인 파드에 영향을 주지 않고 디버깅용 컨테이너를 동적으로 추가하여 네트워크, 파일 시스템 등을 조사하는 기능을 구현합니다. (`kubectl debug` 호환)

## 2. 기술적 설계
### 2.1 백엔드: 컨테이너 주입 로직
- **API**: `kube::api::Api::patch_subresource` 활용.
- **서브리소스**: `ephemeralcontainers`.
- **전략**: `JSON Patch` 또는 `Merge Patch`.
- **보완 (Agent B 피드백)**:
  - 컨테이너 이름 중복 방지를 위한 랜덤 ID 생성.
  - 주입 전 RBAC 권한(pods/ephemeralcontainers patch 권한) 유무 체크 로직 검토.

### 2.2 프론트엔드: 사용자 인터페이스
- **위치**: `ResourceDetail.tsx` (Pod 리소스일 때만 노출).
- **이미지 프리셋**:
  - `busybox:latest` (Lightweight)
  - `nicolaka/netshoot:latest` (Network Debugging)
  - `curlimages/curl:latest` (API Testing)
- **안전장치**: "삭제 불가"에 대한 사용자 명시적 동의 확인.

## 3. 검증 전략 (Agent F)
- **통합 테스트**: `kind` 클러스터의 특정 파드에 실제로 `busybox`를 주입하고, `/proc/1/mounts` 등을 조회하여 주입 성공 여부를 증명.
- **유닛 테스트**: 이미지 선택 시 올바른 JSON 페이로드가 생성되는지 검증.
- **UI 테스트**: 주입 진행 중 상태(Loading)와 완료 후 터미널 자동 연결 로직 검증.

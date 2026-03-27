# Palantir K8s GUI Project Roadmap

이 문서는 Palantir 프로젝트의 개발 진행 상황과 향후 기능 구현 계획을 관리합니다. 모든 마일스톤은 "실행 데이터 기반의 검증"을 통과해야 완료로 간주합니다.

---

## 🟢 Phase 1: Foundation & Core Connectivity (Completed)
*   [x] Cargo Workspace 구조 설계 (`core`, `src-tauri`, `frontend`)
*   [x] Windows/WSL2 Kubeconfig 자동 탐색 로직 구현
*   [x] 기본 리소스(Pod, Namespace) 조회 기능 구현
*   [x] `kube-rs` 기반 K8s 클라이언트 초기화 엔진 완성
*   **Verification**: `test_kube.rs` 통합 테스트 통과 완료.

## 🟢 Phase 2: Interactive Terminal & Real-time Streams (Completed)
*   [x] `xterm.js` 프론트엔드 통합
*   [x] 파드 내부 쉘 접속(Exec) 및 양방향 데이터 스트리밍 구현
*   [x] 실시간 로그 스트리밍 기능 구현
*   [x] 세션 생명주기 관리(Session ID 기반 자원 정리) 도입
*   [x] 정상 종료 시 자동 창 닫기 및 비정상 종료 시 에러 유지 로직 구현
*   **Verification**: `test_exec.rs`, `test_logs.rs` 및 `Terminal.test.tsx` 유닛 테스트 통과 완료.

## 🟢 Phase 3: Generic Resources & Advanced UI (Completed)
*   [x] 범용 리소스 엔진(GVK 기반 DynamicObject) 구축
*   [x] 주요 9종 리소스(Pod, Deployment, SVC, Ingress, CM, Secret 등) 지원
*   [x] 상세 정보(YAML) 조회 패널 구현
*   [x] 환경 변수(Environment Variables) 자동 파싱 및 전용 탭 구현
*   [x] 전역 UI 스케일링(Zoom In/Out) 시스템 도입
*   **Verification**: `test_generic.rs` 및 `ResourceDetailEnv.test.tsx` 통과 완료.

## 🟡 Phase 4: Resource Manipulation & Lifecycle (Next Step)
*   [ ] **YAML Edit & Save**: 상세 패널에서 YAML 직접 수정 및 클러스터 반영 (Apply)
*   [ ] **Delete Resource**: 안전한 확인 절차를 거친 리소스 삭제 기능
*   [ ] **Scale Deployment**: 디플로이먼트 복제본(Replicas) 수 실시간 조절
*   [ ] **Restart/Rollout**: 파드 재시작 및 디플로이먼트 롤아웃 재시작 기능
*   [ ] **Completed Resources**: Job/CronJob 등 실행 후 종료된 리소스의 로그 및 상세 정보 조회 지원
*   **Verification Target**: 리소스 변경 후 실제 클러스터 상태 반영 여부 교차 검증 필수.

## 🔵 Phase 5: Cluster Intelligence & Networking
*   [ ] **Events Viewer**: 네임스페이스/리소스별 K8s 이벤트 실시간 모니터링
*   [ ] **Ephemeral Containers**: `kubectl debug`와 같이 실행 중인 팟에 디버깅용 컨테이너(busybox 등) 동적 주입 기능
*   [ ] **Port Forwarding**: GUI 상에서 간편하게 로컬 포트 포워딩 설정 및 관리
*   [ ] **Cluster Context Switch**: 여러 클러스터 설정을 자유롭게 전환하는 기능
*   [ ] **Resource Search & Filter**: 이름, 라벨 기반의 강력한 필터링 엔진

## 🟣 Phase 6: Extended Ecosystem
*   [ ] **Helm Integration**: 설치된 차트 목록 조회 및 업그레이드/삭제
*   [ ] **Custom Resource Definitions (CRD)**: 사용자 정의 리소스 자동 감지 및 지원

## 🟠 Phase 7: Optimization & Performance
*   [ ] **GUI Latency Fix**: WSL2 환경 등에서의 UI 렌더링 지연 시간 조사 및 최적화
*   [ ] **Backend Streaming Efficiency**: 대량의 로그 발생 시 백엔드 CPU 점유율 최적화

---

## 🛠️ 개발 및 검증 원칙 (Mandates)
1. **Verification First**: 모든 기능은 보고 전 백엔드 통합 테스트와 프론트엔드 유닛 테스트를 거친다.
2. **Environment Aware**: WSL2와 Windows 간의 경로 및 권한 차이를 항상 고려한다.
3. **No Slop Design**: 전문가용 툴에 걸맞은 고밀도, 고해상도 디자인을 유지한다.

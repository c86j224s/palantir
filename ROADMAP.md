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
*   **Verification**: `test_exec.rs`, `test_logs.rs` 및 `Terminal.test.tsx` 유닛 테스트 통과 완료.

## 🟢 Phase 3: Generic Resources & Advanced UI (Completed)
*   [x] 범용 리소스 엔진(GVK 기반 DynamicObject) 구축
*   [x] 주요 9종 리소스(Pod, Deployment, SVC, Job, CronJob 등) 지원
*   [x] 상세 정보(YAML) 조회 패널 구현
*   [x] 환경 변수(Environment Variables) 자동 파싱 및 전용 탭 구현
*   [x] 전역 UI 스케일링(Zoom In/Out) 시스템 도입
*   **Verification**: `test_generic.rs` 및 `ResourceDetailEnv.test.tsx` 통과 완료.

## 🟢 Phase 4: Resource Manipulation & Lifecycle (Completed)
*   [x] **YAML Edit & Save**: 상세 패널에서 YAML 직접 수정 및 서버사이드 적용 (SSA)
*   [x] **Delete Resource**: 배경 전파(Background propagation) 정책을 적용한 안전한 삭제
*   [x] **Scale Deployment**: 디플로이먼트 복제본(Replicas) 수 실시간 슬라이더 조절
*   [x] **Restart/Rollout**: 어노테이션 주입을 통한 디플로이먼트 롤아웃 재시작
*   [x] **Completed Resources**: 종료된 Job/CronJob의 상세 정보 및 정적 로그 조회 지원
*   **Verification**: `resource_lifecycle_it.rs` 및 `resource_pitfalls_it.rs`를 통한 실 클러스터 상태 전이 검증 완료.

## 🟡 Phase 5: Cluster Intelligence & Networking (Current)
*   [x] **Events Viewer**: 전체 클러스터 이벤트 실시간 배치 워칭 및 타임라인 표시
*   [x] **Ephemeral Containers**: 실행 중인 팟에 디버깅용 컨테이너 동적 주입 (Cumulative Patch 적용)
*   [x] **Cross-Compile Pipeline**: Linux에서 Windows용 Manifest/Resource가 내장된 .exe 생성 자동화
*   [x] **WSL2-Windows Bridge**: localhostForwarding 및 SSL 우회 정책을 통한 무설정 연동
*   [x] **[BUG] Debug Shell I/O**: 이벤트 이름 불일치(`exec-output` vs `session-data`) 및 누락된 `write_to_session` 커맨드 수정
*   [x] **[BUG] Container Termination**: `kill 1` exec 후 AttachedProcess stdout 드레인으로 완료 보장, 이미 종료된 컨테이너 graceful 처리
*   [ ] **Port Forwarding**: GUI 상에서 간편하게 로컬 포트 포워딩 설정 및 관리
*   [ ] **Cluster Context Switch**: 여러 클러스터 설정을 자유롭게 전환하는 기능
*   [x] **Kubectl Command Assistant**: UI 액션(삭제, 스케일, 디버그 등)에 대응하는 `kubectl` 명령어를 `?` 아이콘을 통해 보여주고 즉시 복사할 수 있는 가이드 기능 추가 (학습 및 CLI 연동 강화)

## 🟣 Phase 6: Extended Ecosystem
*   [ ] **Helm Integration**: 설치된 차트 목록 조회 및 업그레이드/삭제
*   [ ] **Custom Resource Definitions (CRD)**: 사용자 정의 리소스 자동 감지 및 지원

## 🟠 Phase 7: Optimization & Performance
*   [ ] **GUI Latency Fix**: WSL2 환경에서의 UI 렌더링 지연 및 기민성 저하 문제 해결
*   [ ] **Coverage Quality Gate**: 중요 로직(config, generic) 커버리지 80% 이상 유지

---

## 🛠️ 개발 및 검증 원칙 (Mandates)
1. **Verification First**: 모든 완료 보고 전 `scripts/verify_all.sh` 실행 데이터 제시 필수.
2. **Pitfall Defense**: 단순 성공보다 예외 상황(Immutability, Network Loss 등) 방어력에 집중한다.
3. **Cross-Platform Integrity**: Windows와 Linux(WSL2) 환경 양쪽에서의 무결성을 보장한다.

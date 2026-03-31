# Palantir Phase 6 - Extended Ecosystem 상세 설계안

## 1. 개요
Palantir를 단순 인스펙션 툴에서 실질적인 클러스터 관리 및 개발 보조 도구로 확장합니다. 사용자의 다양한 환경(macOS Intel/ARM, WSL2, Windows)을 모두 지원하며, 다중 클러스터 및 외부 생태계(Helm)와의 연동을 강화합니다.

## 2. 상세 기능 설계

### 2.1 Cluster Context Switch (클러스터 컨텍스트 전환)
- **목적**: `~/.kube/config`에 정의된 여러 클러스터를 GUI 상에서 즉시 전환.
- **Backend (Rust)**:
  - `core/src/config.rs`: `Kubeconfig` 객체에서 `contexts` 리스트를 추출하는 `get_available_contexts()` 구현.
  - `core/src/client.rs`: 기존 `Client`를 특정 컨텍스트로 재설정하는 `switch_context(name: String)` 구현.
  - Tauri `State` 관리: `Client` 객체를 `Arc<Swap<Client>>` 또는 전역 상태 교체 메커니즘으로 관리하여 런타임 교체 지원.
- **Frontend (React)**:
  - 상단 내비게이션 바에 현재 컨텍스트 이름 표시 및 클릭 시 드롭다운 메뉴 노출.
  - 컨텍스트 전환 시 `useQuery` 또는 전역 상태 초기화를 통해 모든 리소스 데이터 새로고침.

### 2.2 Port Forwarding (포트 포워딩)
- **목적**: 파드/서비스의 특정 포트를 로컬 포트로 바인딩.
- **Backend (Rust)**:
  - `kube-rs`의 `PortForwarder`를 사용하여 로컬 TCP 리스너와 파드 스트림 연결.
  - 실행 중인 포트 포워딩 목록을 관리하는 `ForwardManager` 전역 상태 도입.
  - 종료 시 소켓을 확실히 닫는(Cleanup) 로직 포함.
- **Frontend (React)**:
  - `ResourceDetail` 패널에 'Port Forward' 탭 추가.
  - 현재 활성화된 포트 포워딩 현황을 볼 수 있는 전역 패널(Drawer 또는 Modal) 구현.

### 2.3 Helm Support (Helm 연동)
- **목적**: 설치된 Helm 릴리스 목록 조회.
- **Backend (Rust)**:
  - Helm 바이너리 설치 여부와 관계없이, `Secret` (type: `helm.sh/release.v1`) 데이터를 직접 파싱하여 릴리스 정보 추출.
  - 릴리스 이름, 버전, 상태, 업데이트 시간 표시.
- **Frontend (React)**:
  - 사이드바에 'Helm' 메뉴 추가 및 전용 리스트 페이지 구현.

### 2.4 CRD (Custom Resource Definitions) 지원
- **목적**: 표준 리소스 외에 사용자가 정의한 모든 리소스를 자동으로 탐색.
- **Backend (Rust)**:
  - `Discovery` API를 통해 클러스터 내 모든 API Group 탐색.
  - `Generic` 리소스 엔진을 고도화하여 모든 GVK(Group/Version/Kind)에 대응하는 리스트/상세 조회 지원.

## 3. 플랫폼별 고려사항 (Multi-Platform)

- **macOS (Intel/ARM)**: `universal` 바이너리 빌드 전략 및 `~/.kube/config` 기본 경로 우선 사용.
- **WSL2/Windows**: 
  - Windows 호스트와 WSL2 내부의 Kubeconfig 경로 자동 매핑 유지.
  - 포트 포워딩 시 `127.0.0.1` 바인딩이 호스트에서도 접근 가능한지 확인.

## 4. 검증 계획

- **Backend**: `kind` 클러스터에 여러 컨텍스트를 생성하여 전환 테스트 진행.
- **Frontend**: Vitest를 이용한 컨텍스트 선택기 UI 컴포넌트 유닛 테스트.
- **End-to-End**: `verify_all.sh`를 통한 전체 무결성 검사.

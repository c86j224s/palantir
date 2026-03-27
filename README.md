# 👁️ Palantir: Kubernetes GUI Client

**Palantir**는 복잡한 `kubectl` 커맨드에 익숙하지 않은 사용자들도 쿠버네티스 클러스터를 쉽고 시각적으로 관리할 수 있도록 돕는 현대적인 데스크탑 GUI 클라이언트입니다.

> *"커맨드를 외우지 않아도, 클러스터의 내부를 투명하게 들여다보고 조작할 수 있게 합니다."*

---

## 🎯 프로젝트 목적
- **비숙련자 친화적**: 복잡한 CLI 대신 직관적인 UI를 통해 리소스를 탐색합니다.
- **학습 도구**: GUI 조작을 통해 실제 어떤 K8s 명령이 수행되는지 보여주는 **커맨드 치트시트(Command Cheat Sheet)** 기능을 탑재할 예정입니다.
- **크로스 플랫폼**: Windows, WSL2, Linux, Mac 환경에서 동일한 사용자 경험을 제공합니다.

## ✨ 주요 기능 (현재)
- **리소스 탐색**: Pod, Deployment, Service, ConfigMap, Secret 등 주요 리소스 목록 조회.
- **인터랙티브 터미널**: 파드 내부로 즉시 접속하여 명령어를 실행할 수 있는 고성능 쉘(xterm.js) 탑재.
- **실시간 로그**: 애플리케이션 로그를 실시간으로 스트리밍하여 모니터링.
- **상세 명세(YAML)**: 모든 리소스의 상세 설정을 YAML 형식으로 확인 및 환경 변수 자동 파싱.
- **UI 스케일링**: 사용자의 화면 해상도에 맞춰 UI 전체 크기 조절 가능.

## 🚀 시작하기

### 1. 필수 시스템 라이브러리 설치 (WSL2/Linux 기준)
Tauri 앱 빌드를 위해 운영체제에 다음 패키지들이 설치되어 있어야 합니다.
```bash
sudo apt update && sudo apt install -y build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libwebkit2gtk-4.0-dev libsoup2.4-dev
```

### 2. 의존성 설치
```bash
# 루트 및 프론트엔드 패키지 설치
npm install
cd frontend && npm install && cd ..
```

### 3. 개발 모드 실행
```bash
npm run dev
```

## 🛠️ 기술 스택
- **Backend**: Rust, `kube-rs`, `tauri`
- **Frontend**: React (TypeScript), `tailwind-css`, `framer-motion`, `xterm.js`
- **Architecture**: Cargo Workspace를 통한 비즈니스 로직과 UI 계층의 완벽한 분리

---

## 🗺️ 로드맵
앞으로의 상세 개발 계획은 [ROADMAP.md](./ROADMAP.md) 파일에서 확인하실 수 있습니다.

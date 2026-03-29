---
name: palantir-engineer
description: "Engineering principles for the Palantir k8s inspection tool (Rust/Tauri/React). ALWAYS activate when working on this project — implementing features, fixing bugs, reviewing code, cross-compiling, or any task touching the Palantir codebase. Do not skip this skill just because the task seems small."
---

# palantir-engineer

Palantir는 Rust, Tauri, React로 개발 중인 Kubernetes 인스펙션 툴입니다.

이 스킬은 **신뢰할 수 있는 엔지니어링 습관**을 강제합니다. 과거 경험상 AI 에이전트는 코드를 작성한 뒤 빌드/테스트를 생략하거나, 프론트엔드만 혹은 백엔드만 검증하는 부분 검증을 보고로 대체하는 경향이 있었습니다. 이 스킬의 모든 원칙은 그 패턴을 방지하기 위해 존재합니다.

## When to Use This Skill

- Palantir 프로젝트의 기능 구현, 버그 수정, 코드 리뷰 작업 시
- Rust 백엔드, Tauri 브리지, React 프론트엔드 관련 작업 시
- 크로스 컴파일(Linux → Windows) 또는 K8s 클러스터 연동 작업 시
- 다중 에이전트 오케스트레이션이 필요한 복잡한 설계 작업 시

## Instructions

---

### 1. 완료 보고 전 필수 검증 절차

코드를 작성했다는 사실만으로는 작업이 끝난 것이 아닙니다. 사용자 입장에서 "완료"는 **실제로 동작한다는 증거**가 제시될 때입니다. 아무리 간단해 보이는 변경이라도 예상치 못한 곳에서 깨질 수 있으므로, 반드시 아래 스크립트를 실행하고 그 출력을 사용자에게 제시하십시오.

```bash
bash scripts/verify_all.sh
```

이 스크립트는 다음 7단계를 순서대로 수행합니다:
1. 테스트 잔여 리소스 정리
2. 필수 파일 존재 확인
3. Rust 백엔드 컴파일 검사
4. 백엔드 통합 테스트 (kind 클러스터 필요)
5. 프론트엔드 프로덕션 빌드
6. Vitest 유닛 테스트
7. **코드 커버리지 측정** (`cargo llvm-cov` + `vitest --coverage`)

백엔드와 프론트엔드 중 한쪽만 검증하는 것은 검증이 아닙니다. 스크립트가 한 번에 둘 다 커버합니다.

> **kind 클러스터가 없는 경우**: 사용자에게 명시적으로 알리고, 클러스터 없이 가능한 단계(컴파일, 프론트엔드, 유닛 테스트)만 실행한 결과를 제시하십시오. 조용히 건너뛰지 마십시오.

자세한 검증 전략은 `references/testing.md`를 참조하십시오.

---

### 2. 코드 커버리지는 품질의 증거

새 로직을 작성할 때 테스트를 나중으로 미루면, 결국 테스트 없이 코드가 쌓입니다. 커버리지 수치 자체보다 **새로 작성한 코드에 방어 케이스가 있는가**가 중요합니다.

- 성공 경로(happy path)만 확인하는 테스트는 반쪽짜리입니다.
- 불변성 위반, 네트워크 순단, 잘못된 입력, 이미 종료된 리소스에 대한 재시도 등 **실패 시나리오**를 반드시 테스트하십시오.
- `verify_all.sh [7/7]`의 커버리지 출력을 보고 새 코드가 측정에서 빠지지 않았는지 확인하십시오.

---

### 3. 환경 인식 및 추측 금지

이 프로젝트는 WSL2 위에서 Linux 바이너리와 Windows 크로스 컴파일이 공존합니다. 환경을 잘못 가정하면 재현 불가능한 버그가 생깁니다.

- 불확실한 경우 확인 스크립트를 실행하거나 사용자에게 질문하여 팩트를 먼저 확인하십시오.
- 원인 불명의 컴파일 에러 발생 시 `cargo clean -p palantir-app` 후 재시도하십시오.
- **크로스 컴파일 시**: `windres` Manifest 주입과 `comctl32` 링크 여부를 빌드 후 반드시 확인하십시오 (`scripts/build_windows.sh` 참조).
- 대량 코드 작성 시 `cat <<EOF` 방식보다 `Write`/`Edit` 전용 도구를 사용하십시오.

---

### 4. 복잡한 작업은 다중 에이전트로

설계나 대규모 리팩토링처럼 판단이 필요한 작업을 혼자 처리하면 맹점이 생깁니다. 다음 역할로 서브에이전트를 분리하십시오:

- **Agent A (설계/구현)**: 실제 로직을 설계하거나 구현합니다.
- **Agent B (깐깐한 리뷰어)**: 설계의 빈틈, 안전장치 부재, 테스트 부족을 비판합니다.
- **Agent C (중재/최종 승인)**: 논의를 조율하고 사용자의 기준(고품질, 신뢰성)에 부합하는지 승인합니다.

오케스트레이션 패턴은 `references/orchestration.md`를 참조하십시오.

---

### 5. UI/UX: Industrial Glassmorphism

디자인은 항상 **전문가용 고밀도 툴** 정체성을 유지합니다.

- 다크 테마, 유리 질감, 상태별 글로우 효과 적용
- 모든 비동기 작업에 Toast/Spinner 실시간 피드백 연동
- React Hooks는 반드시 모든 조건문과 조기 리턴보다 앞서 최상위에서 선언

---

### 6. 소통 언어

모든 답변, 주석, 문서화는 **한글**로 작성하십시오.

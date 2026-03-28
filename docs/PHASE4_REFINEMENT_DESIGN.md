# Palantir Phase 4 - 조작 기능 정제 설계안

## 1. 백엔드: YAML 반영(Apply) 로직 고도화
- **문제**: 사용자가 상세 패널에서 가져온 YAML을 그대로 수정하여 보낼 경우, `managedFields`나 `uid` 같은 시스템 필드가 포함되어 K8s API가 400 에러를 반환함.
- **해결**: `apply_resource_yaml` 함수 내에서 `serde_json::Value`를 조작하여 다음 필드들을 명시적으로 제거한 후 SSA를 수행함.
  - `metadata.managedFields`
  - `metadata.uid`
  - `metadata.resourceVersion`
  - `metadata.generation`
  - `metadata.creationTimestamp`

## 2. 프론트엔드: 사용자 중심 제어 UI
### 2.1 스케일 조절 (Scale)
- **변경 전**: 슬라이더 조작 시 디바운싱 후 즉시 반영.
- **변경 후**: 슬라이더는 로컬 상태값만 변경. 우측에 나타나는 **[Apply]** 버튼을 클릭해야 실제 클러스터에 반영됨. 취소 시 원래 값으로 복구.

### 2.2 알림 및 피드백 (Toast & Visibility)
- **도구**: `sonner` 라이브러리 도입.
- **토스트 시나리오**:
  - 리소스 삭제: 삭제 요청 시 즉시 토스트 노출 및 패널 닫기.
  - 리소스 수정/반영: 성공 시 "Configuration Applied" 알림.
  - 롤아웃 재시작: "Rollout Restart Triggered" 알림.
- **삭제 시인성**: 삭제 진행 중일 때 해당 리소스를 시각적으로 강조하거나 처리 중임을 표시함.

## 3. 검증 전략 (Agent F)
- **통합 테스트**: `managedFields`가 포함된 YAML을 던졌을 때 백엔드가 이를 필터링하여 성공적으로 반영하는지 확인.
- **유닛 테스트**: 스케일 버튼 클릭 전까지 API 호출이 발생하지 않는지 확인.

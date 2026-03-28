# Palantir K8s GUI - Phase 4 Scale & Restart Design

## 1. Architectural Consensus
This design enables resource lifecycle control with emphasis on concurrency safety and visual feedback.

### 1.1 Backend: Resource Scaling
*   **Target**: Deployment, StatefulSet, ReplicaSet.
*   **Method**: `kube::Api::patch_scale` using `Patch::Merge`.
*   **Implementation**: `core/src/resources/generic.rs` -> `scale_resource_generic`.
*   **Safety**: Return the updated `generation` count to the frontend for verification.

### 1.2 Backend: Rollout Restart
*   **Target**: Deployment, StatefulSet, DaemonSet.
*   **Method**: `Patch::StrategicMerge` on `spec.template.metadata.annotations`.
*   **Annotation Key**: `kubectl.kubernetes.io/restartedAt` (ISO8601 timestamp).
*   **Implementation**: `core/src/resources/generic.rs` -> `restart_resource_generic`.

### 1.3 Frontend: Enhanced Control UI
*   **Scale Control**:
    *   Add a slider + numeric input in `ResourceDetail`.
    *   **Debouncing**: Use a 500ms debounce to prevent API spamming during slider movement.
    *   **Visibility**: Show `Ready Replicas / Desired Replicas` status explicitly.
*   **Restart Control**:
    *   Add a "Rollout Restart" button with a confirmation state.
    *   Provide visual feedback (loading spinner) during the API call.

## 2. Verification Strategy (Agent F Mandate)
*   **Backend Integration Test**:
    1.  Fetch a Deployment's current `generation`.
    2.  Execute `scale_resource_generic`.
    3.  Verify the new `generation` is greater than the previous one.
    4.  Verify `restart_resource_generic` results in a new `generation`.
*   **Frontend Unit Test**:
    1.  Verify that clicking the Scale slider multiple times within 500ms results in only ONE `invoke` call.
    2.  Verify the "Restart" button becomes disabled while the request is pending.

# Palantir K8s GUI - Phase 4 Design Document
**Focus:** Resource Manipulation (YAML Edit/Save & Delete)

## 1. Architectural Consensus (Agent A + Agent B)
This design incorporates baseline functional requirements with strict safety and validation gates to prevent accidental cluster damage.

### 1.1 Backend: YAML Apply (Server-Side Apply)
*   **API**: Use `kube::api::Patch::Apply` via `DynamicObject`.
*   **Safety (Agent B Feedback)**: 
    *   Set `PatchParams::force` to `true` (as GUI edits represent explicit user intent overriding controllers).
    *   Set `PatchParams::field_manager` to `"palantir"` to clearly identify the source of the change in the cluster's audit logs.
*   **Implementation**: `core/src/resources/generic.rs` -> `apply_resource_yaml`.

### 1.2 Backend: Resource Deletion
*   **API**: Use `kube::api::Api::delete`.
*   **Safety (Agent B Feedback)**:
    *   Use `DeleteParams` with `propagation_policy: Some(PropagationPolicy::Background)` to ensure child resources (like Pods of a Deployment) are gracefully garbage collected by K8s, rather than creating orphans.
*   **Implementation**: `core/src/resources/generic.rs` -> `delete_resource_generic`.

### 1.3 Frontend: Safe Editing & Deletion
*   **UI/UX**: Add `Edit` and `Delete` buttons to the `ResourceDetail` header.
*   **Editor**: Use a styled `<textarea>` for editing.
*   **Validation (Agent B Feedback)**: 
    *   Integrate `js-yaml` library.
    *   **Pre-flight Check**: Before calling the Tauri command, parse the text with `js-yaml`. If parsing fails, block the request and show a red error toast/message. Do not hit the K8s API with invalid YAML.
*   **Delete Guard**: A double-confirmation modal or a lock mechanism must be passed before the delete command is executed.

## 2. Testing Strategy (Mandatory before completion)
*   **Integration Tests (`test_generic.rs`)**:
    1.  Create a temporary ConfigMap using the Apply API.
    2.  Modify its content and apply again (verifying `field_manager` updates it).
    3.  Delete the ConfigMap and verify it returns a 200 OK or 404 (if already gone).
*   **Frontend Tests (`Vitest`)**:
    1.  Mock `js-yaml` failure to prove invalid YAML doesn't trigger `invoke`.
    2.  Test the Delete confirmation flow.

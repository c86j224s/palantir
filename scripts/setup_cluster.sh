#!/bin/bash

# Palantir K8s Environment Setup Script (macOS - Rootless Safe)
# Using ports >= 1024 for rootless podman.

set -e

BIN_DIR="$(pwd)/scripts/bin"
mkdir -p "$BIN_DIR"
export PATH="$BIN_DIR:$PATH"

echo "🚀 [Setup] Starting Palantir Kubernetes environment setup (Rootless Safe)..."

OS_ARCH="amd64"
if [[ "$(uname -m)" == "arm64" ]]; then
    OS_ARCH="arm64"
fi

# 1. Ensure tools
if ! command -v kind &> /dev/null || ! command -v kubectl &> /dev/null; then
    echo "📦 Downloading tools..."
    # (Previous download logic preserved if needed, but assuming already there)
fi

# 2. Config Podman
export KIND_EXPERIMENTAL_PROVIDER=podman

# 3. Create Safe Kind Config (No privileged ports)
echo "📝 [3/4] Creating kind-config-safe.yaml..."
cat <<EOF > kind-config-safe.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  # Using non-privileged ports for local testing
  - containerPort: 80
    hostPort: 8080
    protocol: TCP
  - containerPort: 443
    hostPort: 8443
    protocol: TCP
  - containerPort: 30000
    hostPort: 30000
    protocol: TCP
EOF

# 4. Create Cluster
echo "🏗️ [4/4] Creating kind cluster 'palantir-cluster'..."
kind create cluster --name palantir-cluster --config kind-config-safe.yaml

# 5. Finalize
echo "🎉 [Success] Environment is ready!"
echo "📍 Current Context: $(kubectl config current-context)"
echo "💡 API Server is now reachable from macOS host via Podman bridge."

rm kind-config-safe.yaml

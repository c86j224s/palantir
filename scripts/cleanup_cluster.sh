#!/bin/bash
# Palantir Cluster Cleanup Utility
# Reclaims memory by forcefully removing all test remnants.

echo "🧹 Reclaiming cluster memory..."

# 1. Delete all test namespaces
ZOMBIES=$(kubectl get ns --no-headers -o custom-columns=":metadata.name" | grep palantir-it || true)
if [ -n "$ZOMBIES" ]; then
    for ns in $ZOMBIES; do
        echo "Deleting namespace: $ns"
        kubectl delete ns $ns --force --grace-period=0 --wait=false
    done
else
    echo "No zombie namespaces found."
fi

# 2. Delete pods with test labels
kubectl delete pods -l palantir-test=true --all-namespaces --force --grace-period=0 --wait=false > /dev/null 2>&1

# 3. Clean up any stuck terminating namespaces (Nuclear Option)
# Note: Only if really needed, normally the above is enough.

echo "✨ Cluster memory should now be recovering."
kubectl get nodes
kubectl get pods -A

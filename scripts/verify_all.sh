#!/bin/bash
set -e

echo "🔍 [1/6] Checking Essential Files..."
FILES=(".gitignore" "Cargo.toml" "package.json" "src-tauri/tauri.conf.json" "frontend/package.json" "frontend/index.html")
for FILE in "${FILES[@]}"; do
    if [ ! -f "$FILE" ]; then
        echo "❌ Missing file: $FILE"
        exit 1
    fi
done
echo "✅ Essential files present."

echo "🦀 [2/6] Verifying Backend Compilation..."
cargo check -p palantir-app > /dev/null 2>&1

echo "🧪 [3/6] Running Backend Pitfall Defense Tests..."
(cd core && cargo test --test resource_lifecycle_it --test config_pitfalls_it --test resource_pitfalls_it --test event_pitfalls_it > /dev/null 2>&1)
echo "✅ Backend pitfall tests passed."

echo "⚛️ [4/6] Verifying Frontend (Vite Build)..."
(cd frontend && npm run build > /dev/null 2>&1)
echo "✅ Frontend build successful."

echo "🧪 [5/6] Running Frontend Unit Tests (Vitest)..."
(cd frontend && npx vitest run --config vitest.config.ts > /dev/null 2>&1)
echo "✅ All unit tests passed."

echo "📊 [6/6] Measuring Test Coverage..."
echo "--- Backend (Proven Defense) ---"
cargo llvm-cov -p palantir-core --summary-only || true
echo "--- Frontend (Logic Integrity) ---"
(cd frontend && npx vitest run --coverage --config vitest.config.ts | grep "All files" || true)

echo "✨ [SUCCESS] All systems verified with Defensive Testing and Coverage metrics!"

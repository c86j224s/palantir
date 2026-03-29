#!/bin/bash
set -e

TARGET="x86_64-pc-windows-msvc"
OUTPUT_DIR="/mnt/c/palantir_dist"

echo "🚀 Starting Windows Cross-Compilation ($TARGET)..."

# 1. 환경 준비
mkdir -p $OUTPUT_DIR
cargo xwin --version 2>/dev/null || cargo install cargo-xwin

# 2. 프론트엔드 빌드 (정적 파일 생성)
echo "⚛️ Building Frontend..."
cd frontend && npm run build && cd ..

# 3. 백엔드 빌드 (Windows Binary)
echo "🦀 Cleaning and Building Backend Binary for Windows..."
# 이전 빌드 아티팩트 삭제하여 build.rs가 반드시 다시 실행되도록 강제
cargo clean -p palantir-app
cargo xwin build --release --target $TARGET -p palantir-app --features custom-protocol

# 4. 결과물 이동
EXE_PATH="target/$TARGET/release/palantir-app.exe"
TIMESTAMP=$(date +%H%M%S)
DEST_PATH="$OUTPUT_DIR/palantir.exe"

if [ -f "$EXE_PATH" ]; then
    echo "✅ Build Successful! Attempting to copy to $OUTPUT_DIR..."
    # 기존 파일 삭제 시도 (실행 중이면 실패할 수 있음)
    rm -f "$DEST_PATH" || true
    
    if cp "$EXE_PATH" "$DEST_PATH" 2>/dev/null; then
        echo "✨ Final output: $DEST_PATH"
    else
        # 덮어쓰기 실패 시 고유 이름으로 복사
        NEW_DEST="$OUTPUT_DIR/palantir_$TIMESTAMP.exe"
        cp "$EXE_PATH" "$NEW_DEST"
        echo "⚠️  기존 palantir.exe가 사용 중이라 덮어쓸 수 없습니다."
        echo "✨ 대신 새 파일이 생성되었습니다: $NEW_DEST"
    fi
else
    echo "❌ Build failed: Executable not found at $EXE_PATH"
    exit 1
fi

echo "💡 Tip: 윈도우에서 palantir.exe를 실행하기 전, WSL2의 kind 클러스터가 떠 있는지 확인하세요."

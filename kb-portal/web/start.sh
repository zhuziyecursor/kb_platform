#!/bin/bash
# ZZY KB Platform - 前端启动脚本
# 端口: 3105

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT=3105
PID_FILE="$SCRIPT_DIR/.dev.pid"

# 检查是否已在运行
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[前端] 已在运行中 (PID: $OLD_PID, 端口: $PORT)"
    echo "        访问: http://localhost:$PORT"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo "[前端] 正在启动..."
npm run dev &
PID=$!
echo $PID > "$PID_FILE"

# 等待服务就绪
sleep 3
if kill -0 "$PID" 2>/dev/null; then
  echo "[前端] 启动成功 (PID: $PID)"
  echo "        访问: http://localhost:$PORT"
else
  echo "[前端] 启动失败，请检查日志"
  rm -f "$PID_FILE"
  exit 1
fi

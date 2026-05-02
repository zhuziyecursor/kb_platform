#!/bin/bash
# ZZY KB Platform - 前端重启脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT=3105
PID_FILE="$SCRIPT_DIR/.dev.pid"

echo "[前端] 正在停止..."

# 先尝试用 PID 文件杀进程
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null
    sleep 1
    # 如果还没死，强制杀
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID" 2>/dev/null
    fi
  fi
  rm -f "$PID_FILE"
fi

# 兜底：杀掉端口上残留的进程
REMAIN=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$REMAIN" ]; then
  echo "[前端] 清理端口 $PORT 上的残留进程: $REMAIN"
  kill -9 $REMAIN 2>/dev/null || true
fi

sleep 1
echo "[前端] 正在重启..."
bash "$SCRIPT_DIR/start.sh"

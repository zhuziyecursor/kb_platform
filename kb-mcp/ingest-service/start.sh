#!/bin/bash
# ZZY KB Platform - ingest-service 启动脚本
# 端口: 8081

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT=8081
PID_FILE="$SCRIPT_DIR/.dev.pid"
LOG_FILE="$SCRIPT_DIR/.dev.log"

# 检查是否已在运行
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[ingest] 已在运行中 (PID: $OLD_PID, 端口: $PORT)"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo "[ingest] 正在编译并启动..."
mvn spring-boot:run > "$LOG_FILE" 2>&1 &
PID=$!
echo $PID > "$PID_FILE"

echo "[ingest] 启动中 (PID: $PID)，等待服务就绪..."

# 轮询等待端口监听
for i in $(seq 1 60); do
  if lsof -ti :$PORT > /dev/null 2>&1; then
    echo "[ingest] 启动成功 (PID: $PID, 端口: $PORT)"
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "[ingest] 进程已退出，请查看日志: $LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 2
done

echo "[ingest] 启动超时，请查看日志: $LOG_FILE"
exit 1

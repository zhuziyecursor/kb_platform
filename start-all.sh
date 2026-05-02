#!/bin/bash
# =============================================================================
# 企业 AI 知识库 - 应用服务统一启动脚本
# =============================================================================
# 用途: 启动所有应用层服务（不含基础设施，假设 Docker 已运行）
# 前置条件: Docker Compose 基础设施已启动 (kb-postgres, kb-redis, kb-minio,
#           kb-kafka, kb-milvus)
#
# 使用方式:
#   ./start-all.sh          # 启动所有服务
#   ./start-all.sh --check  # 仅检查状态，不重启
#   ./start-all.sh ingest   # 只启动 ingest-service
#   ./start-all.sh --help   # 显示帮助
# =============================================================================

# 强制使用 bash 4+（如果系统有安装）
if [ -x /usr/local/bin/bash ] && /usr/local/bin/bash --version | head -1 | grep -q "version 4"; then
  exec /usr/local/bin/bash "$0" "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# -----------------------------------------------------------------------------
# 服务定义: 名称 | 端口 | 工作目录
# -----------------------------------------------------------------------------
# 注意: macOS bash 3.2 不支持 declare -A，使用数组模拟
SERVICES_INGEST="ingest|8081|kb-mcp/ingest-service"
SERVICES_VECTOR="vector|31002|kb-mcp/vector-service"
SERVICES_DOC="doc-processor|31001|kb-doc-processor"
SERVICES_PORTAL="portal|3105|kb-portal/web"

# -----------------------------------------------------------------------------
# 通用函数
# -----------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()   { echo -e "${GREEN}[ OK ]${NC}  $*"; }
log_skip() { echo -e "${YELLOW}[SKIP]${NC}  $*"; }
log_fail() { echo -e "${RED}[FAIL]${NC}  $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }

port_pid() {
  local port=$1
  lsof -ti :$port 2>/dev/null | head -1
}

wait_for_port() {
  local port=$1
  local name=$2
  local max_wait=${3:-60}
  local interval=${4:-2}
  local waited=0

  while [ $waited -lt $max_wait ]; do
    if port_pid $port > /dev/null 2>&1; then
      return 0
    fi
    sleep $interval
    waited=$((waited + interval))
  done
  return 1
}

stop_service() {
  local name=$1
  local port=$2
  local pid_file=$3

  # 1. PID 文件
  if [ -f "$pid_file" ]; then
    old_pid=$(cat "$pid_file")
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      kill "$old_pid" 2>/dev/null
      sleep 2
      if kill -0 "$old_pid" 2>/dev/null; then
        kill -9 "$old_pid" 2>/dev/null
      fi
      log_info "($name) 停止旧进程 PID=$old_pid"
    fi
    rm -f "$pid_file"
  fi

  # 2. 端口兜底
  local remain=$(port_pid $port)
  if [ -n "$remain" ]; then
    log_warn "($name) 端口 $port 残留进程 $remain，强制清理"
    kill -9 $remain 2>/dev/null || true
    sleep 1
  fi
}

# 解析服务定义，返回指定字段
# 用法: service_field "ingest|8081|dir" 1  →  "ingest"
service_field() {
  local IFS='|'
  set -- $1
  case "$2" in
    1) echo "$1" ;;
    2) echo "$2" ;;
    3) echo "$3" ;;
  esac
}

# -----------------------------------------------------------------------------
# 服务启动函数
# -----------------------------------------------------------------------------

start_ingest() {
  local work_dir="$SCRIPT_DIR/kb-mcp/ingest-service"
  local port=8081
  local pid_file="$work_dir/.dev.pid"
  local log_file="$work_dir/.dev.log"

  if port_pid $port > /dev/null 2>&1; then
    log_skip "[ingest] 已在运行 (端口 $port)，跳过"
    return
  fi

  log_info "[ingest] 启动 ingest-service (端口 $port)..."
  cd "$work_dir"
  nohup mvn spring-boot:run > "$log_file" 2>&1 &
  echo $! > "$pid_file"
  cd "$SCRIPT_DIR"

  if wait_for_port $port "ingest" 90 3; then
    log_ok "[ingest] 启动成功 (端口 $port)"
  else
    log_fail "[ingest] 启动超时，查看日志: $log_file"
  fi
}

restart_ingest() {
  stop_service "ingest" 8081 "$SCRIPT_DIR/kb-mcp/ingest-service/.dev.pid"
  start_ingest
}

start_vector() {
  local work_dir="$SCRIPT_DIR/kb-mcp/vector-service"
  local port=31002
  local pid_file="$work_dir/.dev.pid"
  local log_file="$work_dir/.dev.log"

  if port_pid $port > /dev/null 2>&1; then
    log_skip "[vector] 已在运行 (端口 $port)，跳过"
    return
  fi

  log_info "[vector] 启动 vector-service (端口 $port)..."
  cd "$work_dir"
  nohup mvn spring-boot:run > "$log_file" 2>&1 &
  echo $! > "$pid_file"
  cd "$SCRIPT_DIR"

  if wait_for_port $port "vector" 90 3; then
    log_ok "[vector] 启动成功 (端口 $port)"
  else
    log_fail "[vector] 启动超时，查看日志: $log_file"
  fi
}

restart_vector() {
  stop_service "vector" 31002 "$SCRIPT_DIR/kb-mcp/vector-service/.dev.pid"
  start_vector
}

start_doc_processor() {
  local work_dir="$SCRIPT_DIR/kb-doc-processor"
  local port=31001
  local pid_file="$work_dir/.dev.pid"
  local log_file="$work_dir/.dev.log"
  local venv_python="$work_dir/.venv/bin/python"

  if port_pid $port > /dev/null 2>&1; then
    log_skip "[doc-processor] 已在运行 (端口 $port)，跳过"
    return
  fi

  log_info "[doc-processor] 启动 kb-doc-processor (端口 $port)..."

  if [ ! -x "$venv_python" ]; then
    log_warn "[doc-processor] venv 未找到，创建中..."
    python3 -m venv "$work_dir/.venv" 2>/dev/null || python -m venv "$work_dir/.venv" 2>/dev/null || {
      log_fail "[doc-processor] 无法创建 venv，请确保 python3 -m venv 可用"
      return
    }
  fi

  cd "$work_dir"
  nohup .venv/bin/python -m src.main > "$log_file" 2>&1 &
  echo $! > "$pid_file"
  cd "$SCRIPT_DIR"

  if wait_for_port $port "doc-processor" 30 2; then
    log_ok "[doc-processor] 启动成功 (端口 $port)"
  else
    log_fail "[doc-processor] 启动超时，查看日志: $log_file"
  fi
}

restart_doc_processor() {
  stop_service "doc-processor" 31001 "$SCRIPT_DIR/kb-doc-processor/.dev.pid"
  start_doc_processor
}

start_portal() {
  local work_dir="$SCRIPT_DIR/kb-portal/web"
  local port=3105
  local pid_file="$work_dir/.dev.pid"
  local log_file="$work_dir/.dev.log"

  if port_pid $port > /dev/null 2>&1; then
    log_skip "[portal] 已在运行 (端口 $port)，跳过"
    return
  fi

  log_info "[portal] 启动 kb-portal 前端 (端口 $port)..."
  cd "$work_dir"
  nohup npm run dev > "$log_file" 2>&1 &
  echo $! > "$pid_file"
  cd "$SCRIPT_DIR"

  if wait_for_port $port "portal" 30 2; then
    log_ok "[portal] 启动成功 (端口 $port)"
  else
    log_fail "[portal] 启动超时，查看日志: $log_file"
  fi
}

restart_portal() {
  stop_service "portal" 3105 "$SCRIPT_DIR/kb-portal/web/.dev.pid"
  start_portal
}

# -----------------------------------------------------------------------------
# 状态检查
# -----------------------------------------------------------------------------

check_status() {
  echo ""
  echo "========================================"
  echo "  应用服务状态检查"
  echo "========================================"
  echo ""

  check_one() {
    local name=$1
    local port=$2
    if port_pid $port > /dev/null 2>&1; then
      log_ok "  $name  (端口 $port) - 运行中"
    else
      log_fail "  $name  (端口 $port) - 未运行"
    fi
  }

  check_one "ingest"        8081
  check_one "vector"        31002
  check_one "doc-processor" 31001
  check_one "portal"        3105

  echo ""
  echo "========================================"
  echo "  基础设施检查 (Docker)"
  echo "========================================"
  echo ""

  for container in kb-postgres kb-redis kb-minio kb-kafka kb-milvus; do
    if docker ps --filter "name=$container" --format "{{.Names}}" 2>/dev/null | grep -q "$container"; then
      log_ok "  $container - 运行中"
    else
      log_warn "  $container - 未运行"
    fi
  done
  echo ""
}

# -----------------------------------------------------------------------------
# 启动全部
# -----------------------------------------------------------------------------

restart_all() {
  echo ""
  echo "========================================"
  echo "  启动所有应用服务"
  echo "========================================"
  echo ""

  # 确保 Docker 基础设施运行
  local need_infra=false
  for container in kb-postgres kb-redis kb-minio kb-kafka kb-milvus; do
    if ! docker ps --filter "name=$container" --format "{{.Names}}" 2>/dev/null | grep -q "$container"; then
      need_infra=true
      break
    fi
  done

  if $need_infra; then
    log_warn "基础设施未完全运行，尝试启动 Docker Compose..."
    (cd "$SCRIPT_DIR/kb-infra/docker-compose" && docker compose up -d 2>&1) || true
    echo ""
  fi

  restart_ingest
  echo ""
  restart_vector
  echo ""
  restart_doc_processor
  echo ""
  restart_portal
  echo ""

  echo "========================================"
  echo "  全部服务启动完成"
  echo "========================================"
  echo ""
  check_status
}

# -----------------------------------------------------------------------------
# 入口
# -----------------------------------------------------------------------------

case "${1:-}" in
  --check|-c)
    check_status
    ;;
  ingest)
    restart_ingest
    ;;
  vector)
    restart_vector
    ;;
  doc-processor|docproc|processor)
    restart_doc_processor
    ;;
  portal)
    restart_portal
    ;;
  --help|-h)
    echo "用法: $0 [服务名|选项]"
    echo ""
    echo "无参数       停止并重启所有应用服务"
    echo "--check, -c  仅检查服务状态，不重启"
    echo "ingest       只重启 ingest-service"
    echo "vector       只重启 vector-service"
    echo "doc-processor 只重启 kb-doc-processor"
    echo "portal       只重启 kb-portal 前端"
    echo "--help, -h  显示此帮助"
    echo ""
    echo "前提条件:"
    echo "  - Docker 基础设施已运行"
    echo "  - Maven (Java 服务), Node.js (前端), Python 3.11+ (doc-processor)"
    ;;
  "")
    restart_all
    ;;
  *)
    log_fail "未知参数: $1"
    echo "使用 $0 --help 查看帮助"
    exit 1
    ;;
esac

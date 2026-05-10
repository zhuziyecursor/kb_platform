#!/usr/bin/env bash
# =============================================================================
# 企业 AI 知识库 - 一键启动脚本
# =============================================================================
# 功能:
#   1. 检查 Docker 环境
#   2. 检查 .env 文件是否存在
#   3. 启动所有核心服务
#   4. 等待健康检查通过
#   5. 初始化 Kafka Topics
#   6. 初始化 MinIO Buckets
#   7. 输出连接信息摘要
# =============================================================================

set -euo pipefail

# ---- 颜色定义 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ---- 工具函数 ----
info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- 目录定位 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# =============================================================================
# Step 1: 环境检查
# =============================================================================
info "========== 环境检查 =========="

# 检查 Docker
if ! command -v docker &>/dev/null; then
    error "Docker 未安装, 请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! docker info &>/dev/null 2>&1; then
    error "Docker 未运行, 请先启动 Docker Desktop"
    exit 1
fi
ok "Docker 运行正常 ($(docker --version))"

# 检查 Docker Compose
if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif docker-compose --version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    error "Docker Compose 未安装"
    exit 1
fi
ok "Docker Compose 可用 ($COMPOSE_CMD)"

# 检查 .env 文件
if [ ! -f .env ]; then
    warn ".env 文件不存在, 从模板创建..."
    if [ -f .env.example ]; then
        cp .env.example .env
        ok ".env 已从 .env.example 创建, 请按需修改密码"
    else
        error ".env.example 也不存在, 请检查部署文件完整性"
        exit 1
    fi
else
    ok ".env 文件存在"
fi

# 检查 Docker 内存 (macOS Docker Desktop)
TOTAL_MEM=$(docker system info 2>/dev/null | grep "Total Memory" | awk '{print $3}')
if [ -n "$TOTAL_MEM" ]; then
    # 提取数字
    MEM_NUM=$(echo "$TOTAL_MEM" | grep -oE '[0-9.]+')
    if command -v bc &>/dev/null; then
        if (( $(echo "$MEM_NUM < 6" | bc -l) )); then
            warn "Docker 分配内存仅 ${TOTAL_MEM}, 建议至少 8GB"
            warn "Docker Desktop → Settings → Resources → Memory"
        fi
    fi
fi

echo ""

# =============================================================================
# Step 2: 启动核心服务
# =============================================================================
info "========== 启动核心服务 =========="

$COMPOSE_CMD up -d

echo ""

# =============================================================================
# Step 3: 等待健康检查
# =============================================================================
info "========== 等待服务就绪 =========="

# 服务列表与健康检查超时 (秒) - 使用数组兼容 macOS Bash 3.2
SERVICES="postgres redis minio milvus kafka"

# 超时配置
get_timeout() {
    case $1 in
        postgres) echo 60 ;;
        redis)    echo 30 ;;
        minio)    echo 45 ;;
        milvus)   echo 120 ;;
        kafka)    echo 90 ;;
        *)        echo 60 ;;
    esac
}

ALL_HEALTHY=true

for svc in $SERVICES; do
    timeout=$(get_timeout $svc)
    elapsed=0
    info "等待 ${svc} 就绪 (超时: ${timeout}s)..."

    while [ $elapsed -lt $timeout ]; do
        status=$($COMPOSE_CMD ps --format json 2>/dev/null | docker run --rm -i \
            mikefarah/yq:4 e ".[] | select(.Service==\"${svc}\") | .Health" - 2>/dev/null \
            || echo "unknown")

        if echo "$status" | grep -qi "healthy"; then
            ok "${svc} 就绪 (${elapsed}s)"
            break
        fi

        sleep 3
        elapsed=$((elapsed + 3))

        if [ $elapsed -ge $timeout ]; then
            error "${svc} 未能在 ${timeout}s 内就绪"
            $COMPOSE_CMD logs --tail=20 "$svc"
            ALL_HEALTHY=false
        fi
    done
done

echo ""

if [ "$ALL_HEALTHY" = false ]; then
    error "部分服务启动失败, 请检查上方日志"
    exit 1
fi

ok "所有核心服务已就绪"

echo ""

# =============================================================================
# Step 4: 初始化 Kafka Topics
# =============================================================================
info "========== 初始化 Kafka Topics =========="

TOPICS=("file-ingest" "embed-task" "delta-notify" "user-cud")
PARTITIONS=3
REPLICATION=1

for topic in "${TOPICS[@]}"; do
    # 检查 topic 是否已存在
    existing=$($COMPOSE_CMD exec -T kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
        --bootstrap-server localhost:9092 \
        --list 2>/dev/null | grep "^${topic}$" || true)

    if [ -n "$existing" ]; then
        ok "Topic '${topic}' 已存在, 跳过"
    else
        $COMPOSE_CMD exec -T kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
            --bootstrap-server localhost:9092 \
            --create \
            --topic "$topic" \
            --partitions "$PARTITIONS" \
            --replication-factor "$REPLICATION" \
            2>/dev/null && ok "Topic '${topic}' 创建成功" \
            || warn "Topic '${topic}' 创建失败 (可能已存在)"
    fi
done

echo ""

# =============================================================================
# Step 5: 初始化 MinIO Buckets
# =============================================================================
info "========== 初始化 MinIO Buckets =========="

# 等待 MinIO 就绪
sleep 2

BUCKETS=("kb-raw" "kb-backup" "kb-models")

# 读取 .env 中的 MinIO 凭证
source .env

for bucket in "${BUCKETS[@]}"; do
    # 使用 docker exec 执行 mc 命令
    $COMPOSE_CMD exec -T minio mc alias set local http://localhost:9000 \
        "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" 2>/dev/null || true

    exists=$($COMPOSE_CMD exec -T minio mc ls local/ 2>/dev/null | grep "${bucket}" || true)

    if [ -n "$exists" ]; then
        ok "Bucket '${bucket}' 已存在, 跳过"
    else
        $COMPOSE_CMD exec -T minio mc mb "local/${bucket}" 2>/dev/null \
            && ok "Bucket '${bucket}' 创建成功" \
            || warn "Bucket '${bucket}' 创建失败"
    fi
done

echo ""

# =============================================================================
# Step 6: 输出连接信息
# =============================================================================
info "========== 连接信息摘要 =========="

echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│            知识库基础设施已启动                               │"
echo "├─────────────────────────────────────────────────────────────┤"
echo "│  PostgreSQL   localhost:${POSTGRES_PORT:-25432}  DB: ${POSTGRES_DB:-kb_knowledge}   │"
echo "│  Redis        localhost:${REDIS_PORT:-26379}                              │"
echo "│  MinIO API    http://localhost:${MINIO_API_PORT:-29000}              │"
echo "│  MinIO 控制台   http://localhost:${MINIO_CONSOLE_PORT:-29001}              │"
echo "│  Milvus       localhost:${MILVUS_PORT:-19530} (gRPC)                  │"
echo "│  Kafka        localhost:${KAFKA_PORT:-9092}                           │"
echo "├─────────────────────────────────────────────────────────────┤"
echo "│  Kafka UI     http://localhost:${KAFKA_UI_PORT:-28090} (需先启动)        │"
echo "│  启动命令: docker compose --profile dev-tools up -d          │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""
echo "常用命令:"
echo "  查看状态:   docker compose ps"
echo "  查看日志:   docker compose logs -f <服务名>"
echo "  停止服务:   docker compose down"
echo "  完全清理:   ./cleanup.sh"
echo ""

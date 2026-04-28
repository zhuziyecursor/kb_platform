# 企业 AI 知识库 - 本地开发环境

## 目录

- [环境要求](#环境要求)
- [安装指南](#安装指南)
- [快速开始](#快速开始)
- [架构概览](#架构概览)
- [服务连接信息](#服务连接信息)
- [常用操作](#常用操作)
- [资源规划](#资源规划)
- [常见问题](#常见问题)

---

## 环境要求

### 硬件要求

| 配置 | 最低要求 | 推荐配置 |
|------|---------|---------|
| 内存 | 8 GB | **16 GB** |
| CPU | 4 核 | **8+ 核** |
| 磁盘 | 50 GB | **100 GB+** |

### 软件要求

- **Docker Desktop** (macOS) 或 Docker Engine (Linux)
  - 下载地址: https://www.docker.com/products/docker-desktop
  - **macOS 安装后需要配置内存，见下方说明**

- **Docker Compose** (V2 或 V1)
  - V2: `docker compose` (已内置于 Docker Desktop)
  - V1: `docker-compose` (独立安装)

### macOS Docker Desktop 配置

1. 打开 **Docker Desktop** → 点击右上角 **设置图标**
2. 选择 **Resources** (资源) 选项卡
3. 调整以下配置:

```
Memory:     ████████████ 8 GB 或更高 (建议 16 GB)
CPUs:       ████████     4 核 或更高
Swap:       ██           2 GB
Disk image: ████████     100 GB 或更高
```

> ⚠️ **重要**: 默认 Docker Desktop 分配的内存可能只有 2GB，**必须手动调大到 8GB 以上**，否则 Milvus 无法正常启动。

---

## 安装指南

### Step 1: 克隆项目 (已有可跳过)

```bash
cd /Users/apple/Documents/work_project
# 如果是新克隆
# git clone <项目地址> konwledge_db
cd konwledge_db/kb-infra
```

### Step 2: 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，修改密码 (开发环境可直接使用默认值)
vim .env
```

**重要配置项说明** (.env 文件):

```bash
# PostgreSQL - 避开 5432 端口
POSTGRES_PORT=25432
POSTGRES_USER=kb_admin
POSTGRES_PASSWORD=kb_admin_dev  # 生产环境请修改

# Redis - 避开 6379 端口
REDIS_PORT=26379
REDIS_PASSWORD=kb_redis_dev

# MinIO - 避开 9000/9001 端口
MINIO_API_PORT=29000
MINIO_CONSOLE_PORT=29001

# Kafka
KAFKA_PORT=9092
KAFKA_ADVERTISED_HOST=localhost  # 本机开发用 localhost
```

### Step 3: 启动服务

**方式一: 一键启动 (推荐)**

```bash
# 执行启动脚本，自动完成健康检查和初始化
./start.sh
```

**方式二: 手动启动**

```bash
# 启动所有服务
docker compose up -d

# 等待服务就绪 (约 2-3 分钟)
docker compose ps

# 检查服务健康状态
# 确保所有服务的 Status 为 "healthy"
```

### Step 4: 验证安装

```bash
# 1. 检查所有服务状态
docker compose ps

# 输出应类似:
# NAME                IMAGE                    STATUS
# kb-postgres         postgres:15-alpine       Up (healthy)
# kb-redis            redis:7-alpine           Up (healthy)
# kb-minio            minio/minio:latest       Up (healthy)
# kb-milvus           milvusdb/milvus:v2.4.17  Up (healthy)
# kb-kafka            bitnami/kafka:3.6        Up (healthy)

# 2. 验证 PostgreSQL
docker compose exec postgres psql -U kb_admin -d knowledge -c "SELECT version();"

# 3. 验证 Redis
docker compose exec redis redis-cli -a kb_redis_dev ping

# 4. 验证 Milvus (检查日志)
docker compose logs milvus | grep "Milvus Proxy start successfully"

# 5. 验证 MinIO (访问控制台)
# 浏览器打开 http://localhost:29001
# 用户名/密码: 见 .env 中的 MINIO_ROOT_USER/MINIO_ROOT_PASSWORD

# 6. 验证 Kafka Topics
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
# 应输出: delta-notify  embed-task  file-ingest  user-cud
```

### Step 5: 启动可选工具 (开发调试)

```bash
# 启动 Kafka UI (消息查看器)
docker compose --profile dev-tools up -d

# 访问 http://localhost:28090
```

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        kb-network (bridge)                          │
│                                                                     │
│  ┌──────────┐  ┌────────┐  ┌─────────┐  ┌──────────────┐            │
│  │PostgreSQL│  │ Redis  │  │  MinIO  │  │    Milvus    │            │
│  │   :5432  │  │  :6379 │  │  :9000  │  │ Standalone   │            │
│  │ 元数据   │  │ 缓存   │  │ Raw存储 │  │   :19530     │            │
│  │ ACL      │  │ 会话   │  │ 模型   │  │ 向量检索     │            │
│  │ 审计     │  │        │  │ 备份   │  │ (内含etcd)   │            │
│  └──────────┘  └────────┘  └─────────┘  └──────────────┘            │
│                                                                     │
│  ┌──────────┐  ┌────────────┐                                       │
│  │  Kafka  │  │ Kafka UI   │  (dev-tools profile)                  │
│  │  :9092  │  │  :8080    │                                       │
│  │ 消息总线│  │ Topic管理  │                                       │
│  │ KRaft   │  │ 消息查看   │                                       │
│  └──────────┘  └────────────┘                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

本机端口映射 (避开 OCR 项目已占用端口):
┌──────────────┬────────────────────────┬─────────────────────────────┐
│ 组件         │ 本机端口               │ 说明                        │
├──────────────┼────────────────────────┼─────────────────────────────┤
│ PostgreSQL   │ localhost:25432        │ 知识元数据 / ACL / 审计      │
│ Redis       │ localhost:26379        │ 缓存 / 会话                  │
│ MinIO API   │ localhost:29000        │ S3 兼容对象存储              │
│ MinIO 控制台 │ localhost:29001        │ Web 管理界面                 │
│ Milvus      │ localhost:19530        │ gRPC 向量检索                │
│ Milvus 指标  │ localhost:9091         │ Prometheus 指标              │
│ Kafka       │ localhost:9092         │ 消息队列                     │
│ Kafka UI    │ localhost:28090         │ 可选，需 dev-tools profile   │
└──────────────┴────────────────────────┴─────────────────────────────┘
```

---

## 服务连接信息

### PostgreSQL

| 项目 | 值 |
|------|-----|
| Host | `localhost` |
| Port | `25432` |
| Database | `knowledge` |
| Username | `kb_admin` |
| Password | 见 `.env` 文件 |
| JDBC URL | `jdbc:postgresql://localhost:25432/knowledge` |
| JDBC Driver | `org.postgresql.Driver` |

### Redis

| 项目 | 值 |
|------|-----|
| Host | `localhost` |
| Port | `26379` |
| Password | 见 `.env` 文件 |
| URL | `redis://:<密码>@localhost:26379/0` |

### MinIO

| 项目 | 值 |
|------|-----|
| API Endpoint | `http://localhost:29000` |
| Console | `http://localhost:29001` |
| Access Key | 见 `.env` 文件 |
| Secret Key | 见 `.env` 文件 |
| S3 SDK Endpoint | `http://localhost:29000` |

### Milvus

| 项目 | 值 |
|------|-----|
| gRPC Endpoint | `localhost:19530` |
| Metrics | `http://localhost:9091/metrics` |

### Kafka

| 项目 | 值 |
|------|-----|
| Bootstrap Servers | `localhost:9092` |
| Kafka UI | `http://localhost:28090` (需 dev-tools profile) |

### Kafka Topics

| Topic | Partitions | 用途 |
|-------|-----------|------|
| `file-ingest` | 3 | 文件入库触发 (Raw → Parse → Clean → Structured) |
| `embed-task` | 3 | 向量化任务 (Chunk → Embedding → Milvus Upsert) |
| `delta-notify` | 3 | 增量更新通知 (知识版本变更 / ACL 变更) |
| `user-cud` | 3 | 用户/组织/角色变更广播 (缓存失效) |

---

## 常用操作

### 启动和停止

```bash
# 一键启动 (推荐)
./start.sh

# 停止所有服务 (保留数据)
docker compose down

# 停止并清除所有数据 (慎用!)
docker compose down -v

# 完全清理 (使用脚本)
./cleanup.sh
```

### 查看日志

```bash
# 查看所有服务日志
docker compose logs -f

# 查看单个服务日志
docker compose logs -f postgres
docker compose logs -f kafka
docker compose logs -f milvus
docker compose logs -f redis
docker compose logs -f minio

# 查看最近 100 行日志
docker compose logs --tail=100 kafka
```

### 服务管理

```bash
# 重启单个服务
docker compose restart kafka

# 重启所有服务
docker compose restart

# 查看服务状态
docker compose ps

# 查看资源使用
docker stats
```

### 数据库操作

```bash
# 连接 PostgreSQL
docker compose exec postgres psql -U kb_admin -d knowledge

# 执行 SQL 文件
docker compose exec -T postgres psql -U kb_admin -d knowledge < /path/to/script.sql

# 备份数据库
docker compose exec postgres pg_dump -U kb_admin knowledge > backup.sql

# 恢复数据库
docker compose exec -T postgres psql -U kb_admin -d knowledge < backup.sql
```

### Kafka 操作

```bash
# 创建 Topic
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create \
  --topic my-topic \
  --partitions 3 \
  --replication-factor 1

# 列出所有 Topics
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list

# 发送测试消息
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 --topic file-ingest

# 消费测试消息
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic file-ingest --from-beginning
```

### MinIO 操作

```bash
# 进入 MinIO 容器
docker compose exec minio sh

# 使用 mc 命令行工具
mc alias set local http://localhost:9000 <ACCESS_KEY> <SECRET_KEY>

# 列出 buckets
mc ls local/

# 创建 bucket
mc mb local/kb-test

# 上传文件
mc cp ./test.txt local/kb-raw/
```

---

## 资源规划

基于 **macOS 16GB 内存 + 8+ 核 CPU**:

| 组件 | CPU 限制 | 内存限制 | 磁盘 (数据卷) |
|------|---------|---------|--------------|
| PostgreSQL | 2.0 核 | 1 GB | 50 GB |
| Redis | 1.0 核 | 512 MB | 1 GB |
| MinIO | 1.0 核 | 512 MB | 200 GB |
| Milvus | 4.0 核 | 4 GB | 100 GB |
| Kafka | 1.5 核 | 1 GB | 10 GB |
| Kafka UI | 0.5 核 | 256 MB | - |
| **合计** | **~9 核** | **~7.3 GB** | **~361 GB** |

### 内存调整指南

如果 Docker Desktop 分配的内存有限，可以按以下优先级降低资源:

1. **Milvus** (最耗内存，可降至 2GB 开发够用)
   - 编辑 `docker-compose.yml`，找到 `milvus.deploy.resources.limits.memory`
   - 将 `4G` 改为 `2G`

2. **Kafka** (可降至 768MB)
   - 找到 `kafka.deploy.resources.limits.memory`
   - 将 `1G` 改为 `768m`

3. **PostgreSQL** (可降至 768MB)
   - 找到 `postgres.deploy.resources.limits.memory`
   - 将 `1G` 改为 `768m`

### Docker Desktop 内存分配建议

| 目标 | Docker Desktop 内存分配 |
|------|------------------------|
| 流畅开发 (推荐) | **12-16 GB** |
| 最低可用 | **8 GB** |
| 极简测试 | **6 GB** (需降低各组件内存限制) |

---

## 数据库初始化

### 初始化脚本说明

PostgreSQL 首次启动时，会自动执行 `init-db/` 目录下的 SQL 文件:

```
init-db/
├── 001_create_schemas.sql      # 创建 schema (kb_auth, kb_user, kb_knowledge, kb_audit)
├── 002_auth_tables.sql         # 认证相关表 (oauth_client, token_audit, key_store, jti_blacklist)
├── 003_user_tables.sql        # 用户组织表 (tenant, user, org_dept, user_role, role_permission)
├── 004_knowledge_tables.sql   # 知识元数据表 (knowledge_doc, knowledge_clean, knowledge_structured)
├── 005_acl_tables.sql         # ACL 权限表 (doc_acl, perm_group, perm_group_member)
└── 006_audit_tables.sql       # 审计日志表 (kb_search_audit)
```

### 重新初始化

> ⚠️ **注意**: 此操作会清除所有数据!

```bash
# 1. 停止服务并清除数据卷
docker compose down -v

# 2. 重新启动
docker compose up -d

# 3. 等待 PostgreSQL 初始化完成 (约 30 秒)
docker compose logs -f postgres
```

---

## 目录结构

```
kb-infra/
├── docker-compose.yml      # 主编排文件
├── .env                    # 本地环境配置 (不提交 Git)
├── .env.example           # 环境变量模板 (提交 Git)
├── .gitignore             # Git 忽略规则
├── start.sh               # 一键启动脚本 (启动 + 健康检查 + 初始化)
├── cleanup.sh             # 清理脚本 (停止 + 清除数据)
├── README.md              # 本文件
├── prometheus/            # (预留) Prometheus 配置
│   └── prometheus.yml
├── init-db/               # PostgreSQL 初始化 SQL
│   ├── README.md
│   ├── 001_create_schemas.sql
│   ├── 002_auth_tables.sql
│   ├── 003_user_tables.sql
│   ├── 004_knowledge_tables.sql
│   ├── 005_acl_tables.sql
│   └── 006_audit_tables.sql
└── kb-infra.code-workspace # VS Code 工作区配置 (可选)
```

---

## 常见问题

### Q1: Milvus 启动失败 / 内存不足

**症状**: `docker compose logs milvus` 显示内存错误或健康检查超时

**解决方案**:
1. 打开 Docker Desktop 设置
2. Resources → Memory → 调大到 **8GB 或更高**
3. 重启 Docker Desktop
4. 重新启动: `docker compose up -d`

### Q2: Kafka 消费者连接失败

**症状**: 应用无法连接到 Kafka

**解决方案**:
1. 确认 `KAFKA_ADVERTISED_HOST` 设置正确
   - 本机开发: `localhost`
   - 局域网其他机器: 改为实际 IP
2. 检查端口是否被占用: `lsof -i :9092`

### Q3: PostgreSQL 端口冲突

**症状**: `bind: address already in use`

**解决方案**:
```bash
# 查看哪个进程占用了端口
lsof -i :25432

# 在 .env 中修改端口
POSTGRES_PORT=25433  # 改为其他端口
```

### Q4: 所有端口被 OCR 项目占用

**原因**: 技术方案要求避开 OCR 项目端口 (5432/6379/9000/9001/80/443)

**当前配置已避开**: 25432 / 26379 / 29000 / 29001

**如需调整**: 编辑 `.env` 文件修改对应端口

### Q5: 如何验证 Milvus 是否正常

```bash
# 方法一: 检查日志关键字
docker compose logs milvus | grep "Milvus Proxy start successfully"

# 方法二: 使用 Milvus CLI (需要安装)
# pip install pymilvus
# milvus-cli 连接到 localhost:19530

# 方法三: 访问 Milvus Dashboard (如有配置)
# http://localhost:9091
```

### Q6: 如何验证 Kafka Topic 创建成功

```bash
# 方法一: Kafka UI
# 浏览器访问 http://localhost:28090

# 方法二: 命令行
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
# 应输出: delta-notify  embed-task  file-ingest  user-cud
```

### Q7: 启动脚本执行失败

**症状**: `./start.sh` 执行报错

**解决方案**:
```bash
# 检查 Docker 是否运行
docker info

# 检查 docker compose 命令是否可用
docker compose version

# 手动执行各步骤
docker compose up -d
docker compose logs -f
```

### Q8: 数据卷空间不足

**症状**: Docker 提示磁盘空间不足

**解决方案**:
```bash
# 清理未使用的 Docker 资源
docker system prune -a

# 清理未使用的卷
docker volume prune

# 清理停止的容器
docker container prune
```

---

## 下一步

完成基础设施安装后，可以继续:

1. **数据库初始化** - 确保 `init-db/` 目录下的 SQL 文件已执行
2. **应用服务部署** - 部署 auth-adapter-service、KB MCP 等 Java 服务
3. **Dify 接入配置** - 配置 Dify 与知识库服务的连接

详见: [技术方案文档](../doc/企业AI知识库技术方案（Dify+统一用户体系+MCP）.md)

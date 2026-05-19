# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目架构

**企业AI知识库 MVP** — 5分钟内文档可检索，返回带引用的可信答案。

### 服务拓扑

```
kb-portal (Next.js)
    ↓ HTTP (经过 kb-gateway)
kb-mcp/
├── kb-gateway     # JWT 校验，路由到后端服务
├── auth-adapter   # OIDC 登录 + OBO Token Exchange
├── user-service   # 用户上下文缓存
├── ingest-service # 文档元数据管理，触发入库流水线 (端口 8081)
├── vector-service # 向量化 + Milvus 写入 (端口 31002)
├── rag-service    # RAG 检索 + LLM 对话 (端口 31005)
└── llm-gateway    # LLM 路由 + 审计 (端口 31004)
kb-doc-processor/  # Kafka 消费 → 解析/清洗/切片 (端口 31001, Python)
rerank-service/    # BGE-Reranker 重排序 (端口 31003, Python)
kb-infra/          # Docker Compose: PostgreSQL / Redis / MinIO / Kafka / Milvus
```

### 数据流（两条链路）

**链路B — 入库**：Portal → ingest-service → `file-ingest` Kafka → kb-doc-processor → `embed-task` Kafka → vector-service → Milvus

**链路A — 检索**：Portal → rag-service → Milvus → rerank → llm-gateway → Portal

### 端口分配

| 端口 | 服务 |
|------|------|
| 3105 | kb-portal (Next.js 前端) |
| 8081 | ingest-service |
| 31001 | kb-doc-processor (Python) |
| 31002 | vector-service |
| 31003 | rerank-service (Python) |
| 31004 | llm-gateway |
| 31005 | rag-service |
| 25432 | PostgreSQL (Docker → 宿主机映射) |
| 29000 | MinIO API (Docker → 宿主机映射) |
| 29092 | Kafka (Docker → 宿主机映射) |
| 26379 | Redis (Docker → 宿主机映射) |
| 19530 | Milvus (Docker → 宿主机映射) |

### Kafka Topics

| Topic | 生产者 | 消费者 | 消息契约 |
|-------|--------|--------|---------|
| `file-ingest` | ingest-service | kb-doc-processor | `contracts/kafka-schemas/file-ingest-message.json` |
| `embed-task` | kb-doc-processor | vector-service | `contracts/kafka-schemas/embed-task-message.json` |

Kafka 控制台命令：
```bash
# 列出所有 topic
docker exec kb-kafka kafka-topics --bootstrap-server localhost:9092 --list
# 查看消费者组 lag
docker exec kb-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --group kb-doc-processor --describe
# 查看 topic 消息
docker exec kb-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic file-ingest --from-beginning --max-messages 1
```

### MinIO / S3 路径规范

原始文件存储 bucket: `kb-raw`。文档路径格式：`kb-raw/{tenant}/{biz_domain}/{source_type}/{yyyy}/{mm}/{doc_id}/文件名`。

处理器从 Kafka 消息的 `srcPath` 字段获取路径，通过 MinIO client 下载文件。

### 契约目录 (`contracts/`)

所有接口/消息格式的**唯一真实来源**。REST 接口在 `contracts/openapi/`、Kafka 消息在 `contracts/kafka-schemas/`、Milvus Collection 定义在 `contracts/milvus/`。实现与契约不一致时，以契约为准修改代码。

### Gateway 路由

| 路由前缀 | 目标服务 | 所需 scope |
|---------|---------|-----------|
| `/kb/v1/**` | ingest-service | kb:upload |
| `/rag/v1/**` | rag-service | kb:search |
| `/user/v1/**` | user-service | openid |

Gateway 只做 JWT 校验（iss/aud/scope/tenant），不执行任何业务逻辑。所有自定义 HTTP 头（`x-user-id`、`x-tenant-id`、`x-roles` 等）在 Gateway 层剥离，下游服务从 OBO token JWT claims 解析用户上下文。

### 禁止的跨服务调用

| 禁止 | 正确方式 |
|------|---------|
| ingest-service → kb-doc-processor (HTTP) | 发布到 `file-ingest` Kafka topic |
| kb-doc-processor → embedding-service | 发布到 `embed-task` topic |
| rag-service → PostgreSQL / MinIO | 通过 Milvus 检索 |
| 任何服务接受 `X-User-Id` 等自定义头 | 从 OBO token JWT claims 解析 |

---

## 常用命令

### 全量启动（假设 Docker 已运行）

```bash
./start-all.sh              # 启动所有应用服务
./start-all.sh --check      # 仅检查状态
./start-all.sh ingest       # 只启动 ingest-service
```

### Java 服务 (kb-mcp/)

```bash
# 构建单个服务
cd kb-mcp/ingest-service && mvn clean package -DskipTests

# 运行
# localhost:25432 是 Docker 容器 kb-postgres 暴露到宿主机的端口
DB_HOST=localhost DB_PORT=25432 DB_NAME=kb_knowledge \
DB_USERNAME=kb_ingest DB_PASSWORD=kb_ingest \
java -jar target/ingest-service-0.0.1-SNAPSHOT.jar

# 运行全部测试
mvn test

# 运行单个测试类或方法
mvn test -Dtest=IngestServiceTest
mvn test -Dtest=IngestServiceTest#testCreateDoc
```

### Python 服务

```bash
# kb-doc-processor
cd kb-doc-processor && python -m venv .venv && .venv/bin/pip install -e .
.venv/bin/python -m src.main
.venv/bin/pytest tests/                          # 全部测试
.venv/bin/pytest tests/test_semantic_chunker.py -v  # 单个测试文件

# rerank-service
cd rerank-service && python -m venv .venv && .venv/bin/pip install -e .
.venv/bin/python -m src.main
.venv/bin/pytest tests/ -v
```

### 前端 (kb-portal/web)

```bash
cd kb-portal/web && npm run dev    # 端口 3105
cd kb-portal/web && npm run build  # 生产构建
```

### 数据库初始化

```bash
# 进入 postgres 容器
docker exec -it kb-postgres psql -U kb_admin -d kb_knowledge

# 创建服务用户（首次）
CREATE USER kb_ingest WITH PASSWORD 'kb_ingest';
GRANT CONNECT ON DATABASE kb_knowledge TO kb_ingest;
```

### Docker Compose (kb-infra/)

```bash
cd kb-infra/docker-compose && docker compose up -d
```

---

## 入口文件

| 服务 | 启动入口 |
|------|---------|
| ingest-service | `kb-mcp/ingest-service/src/main/java/com/kb/ingest/KbIngestApplication.java` |
| vector-service | `kb-mcp/vector-service/src/main/java/com/kb/vector/KbVectorApplication.java` |
| rag-service | `kb-mcp/rag-service/src/main/java/com/kb/rag/KbRagApplication.java` |
| llm-gateway | `kb-mcp/llm-gateway/src/main/java/com/kb/llm/KbLlmGatewayApplication.java` |
| kb-doc-processor | `kb-doc-processor/src/main.py` |
| rerank-service | `rerank-service/src/main.py` |

---

## 表所有权

每个服务只能写入自己拥有的表。跨服务写表是架构错误。

### kb_knowledge (12 表 + 1 视图)

| 表 | 拥有服务 | 说明 |
|----|---------|------|
| `knowledge_doc` | ingest-service | 文档元数据主表 |
| `knowledge_version` | ingest-service(INSERT) / vector-service(UPDATE) / kb-doc-processor(UPDATE) | 文档版本状态机 |
| `doc_acl` | ingest-service | 文档级 ACL |
| `doc_perm_group` | ingest-service | 文档与权限组关联，Milvus 预过滤 |
| `knowledge_space` | ingest-service | 知识空间管理 |
| `space_acl` | ingest-service | 空间级 ACL（角色/用户/部门） |
| `knowledge_clean` | kb-doc-processor | 清洗层：统一文本 + 页码锚点 |
| `knowledge_structured` | kb-doc-processor | 结构化层：标题层级/表格/实体 |
| `embed_task` | kb-doc-processor(INSERT) / vector-service(UPDATE) | 嵌入任务队列，Milvus upsert 幂等 |
| `knowledge_search_idx` | vector-service | BM25 全文检索索引（tsvector） |
| `rag_session` | rag-service | RAG 会话主表 |
| `rag_message` | rag-service | RAG 会话消息表 |
| `faq_knowledge` | rag-service | FAQ 高频问题预置答案 |

视图: `v_knowledge_structured_acl` — kb_rag 有 SELECT 权限

### kb_audit (11 表)

| 表 | 拥有服务 | 说明 |
|----|---------|------|
| `kb_doc_audit` | ingest-service | 文档操作审计（上传/入库/下架/删除/ACL变更） |
| `acl_change_history` | ingest-service | ACL 变更历史，支持审计与回滚 |
| `rag_pipeline_trace` | rag-service | RAG Pipeline 可观测性记录 |
| `rag_feedback` | rag-service | 用户反馈（点赞/点踩/报错） |
| `badcase_archive` | rag-service | Badcase 归档（点踩/报错自动归档） |
| `alert_log` | rag-service | RAG 监控告警日志 |
| `eval_dataset` | rag-service | 评测数据集主表 |
| `eval_qa_pair` | rag-service | 评测 QA 对 |
| `eval_run` | rag-service | 评测运行记录 |
| `eval_qa_result` | rag-service | 单条评测结果 |
| `reconcile_log` | vector-service | Milvus/PG 数据一致性对账日志 |

### kb_user (1 表)

| 表 | 拥有服务 | 说明 |
|----|---------|------|
| `user_context_cache` | user-service | 用户上下文缓存（Redis 优先，PG 备份） |

> **注意**: `02_service_users.sql` 中 kb_ingest 被授予了 `ALL ON ALL TABLES IN SCHEMA kb_knowledge`，实际权限范围超过了逻辑所有权。上表反映的是逻辑所有权，`02_service_users.sql` 的 GRANT 应逐步收紧以对齐逻辑所有权。

---

## trace_id 规范

所有服务入口必须生成或传递 `trace_id`，格式 `tr-{uuid4}`，如 `tr-a1b2c3d4-e5f6-7890-abcd-ef1234567890`。全链路：前端 → gateway → ingest → Kafka → processor → Kafka → vector → Milvus。

---

## PHASE2 占位规则

一期禁止的功能（OCRParser、PIIFilter、BM25 等）必须标注占位：

- **Java**：`@Phase2Feature` 注解 + 构造方法 `throw new UnsupportedOperationException("PHASE2_PLACEHOLDER: ...")`
- **Python**：`__init__` 中 `raise NotImplementedError("PHASE2_PLACEHOLDER: ...")` + `# PHASE2:` 注释

---

## 调试协议

1. 始终先读错误信息——在调查任何其他内容之前，记下确切的文件路径和行号。
2. 在探索不相关的文件之前，先检查指定文件中指定的行。
3. 在跳入代码修复之前，先检查日志（后端 stdout、浏览器控制台、网络面板）。
4. 在进行任何编辑之前，提出一个根因假设。

---

## 构建与测试验证（强制）

- 在任何代码变更之后，运行构建：`npm run build`（前端）或 `mvn compile`（后端）。
- 后端变更之后，运行测试：`mvn test`。
- 绝不在构建不通过的情况下声明工作完成。
- 在运行依赖它们的任何操作之前，先安装依赖（`npm install`、`pip install -r requirements.txt`）。
- 如果测试失败，在征求用户确认之前先修复它们。

---

## 配置规范

### 环境变量

所有服务通过环境变量注入配置，统一使用 `KB_` 前缀：

| 变量 | 说明 |
|------|------|
| `KB_DB_HOST` / `KB_DB_PORT` / `KB_DB_NAME` | PostgreSQL 连接 |
| `KB_DB_USERNAME` / `KB_DB_PASSWORD` | 数据库凭据（每个服务用自己的用户） |
| `KB_MINIO_ENDPOINT` / `KB_MINIO_ACCESS_KEY` / `KB_MINIO_SECRET_KEY` | MinIO S3 |
| `KB_KAFKA_BOOTSTRAP_SERVERS` | Kafka 地址 |
| `KB_REDIS_HOST` / `KB_REDIS_PORT` / `KB_REDIS_PASSWORD` | Redis |
| `KB_MILVUS_HOST` / `KB_MILVUS_PORT` | Milvus 向量库 |
| `KB_EMBEDDING_SERVICE_URL` | 外部 Embedding 服务地址 |

### 核心配置文件位置

| 配置 | 路径 |
|------|------|
| Docker Compose 环境变量 | `kb-infra/.env` |
| Java 服务配置 | `kb-mcp/{service}/src/main/resources/application.yml` |
| kb-doc-processor 配置 | `kb-doc-processor/config/settings.yaml` |
| rerank-service 配置 | `rerank-service/config/settings.yaml` |
| 前端环境变量 | `kb-portal/web/.env.local` |

### 配置修改原则

- 编辑配置文件后必须重启对应服务
- Java 服务数据库用户名禁止修改为其他服务的用户（每个服务使用专属 DB 用户）
- 前端连接后端 API 时，后端需配置 CORS 允许 `localhost:3105`
- 代码中引用数据库列之前，先通过 `docker exec kb-postgres psql ... -c "\d table_name"` 验证列存在

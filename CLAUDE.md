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

### 契约目录 (`contracts/`)

所有接口/消息格式的**唯一真实来源**。REST 接口在 `contracts/openapi/`、Kafka 消息在 `contracts/kafka-schemas/`、Milvus Collection 定义在 `contracts/milvus/`。实现与契约不一致时，以契约为准修改代码。

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
# 构建（每个服务目录下）
cd kb-mcp/ingest-service && mvn clean package -DskipTests

# 运行
DB_HOST=localhost DB_PORT=25432 DB_NAME=knowledge \
DB_USERNAME=kb_ingest DB_PASSWORD=kb_ingest \
java -jar target/ingest-service-0.0.1-SNAPSHOT.jar
```

### Python 服务 (kb-doc-processor / rerank-service)

```bash
# 安装依赖
cd kb-doc-processor && python -m venv .venv && .venv/bin/pip install -e .

# 运行
.venv/bin/python -m src.main

# 测试
.venv/bin/pytest tests/
```

### 前端 (kb-portal/web)

```bash
cd kb-portal/web && npm run dev    # 端口 3105
cd kb-portal/web && npm run build  # 生产构建
```

### 数据库初始化

```bash
# 进入 postgres 容器
docker exec -it kb-postgres psql -U kb_admin -d knowledge

# 创建服务用户（首次）
CREATE USER kb_ingest WITH PASSWORD 'kb_ingest';
GRANT CONNECT ON DATABASE knowledge TO kb_ingest;
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

| 表 | Schema | 拥有服务 |
|----|--------|---------|
| `knowledge_doc` | kb_knowledge | ingest-service |
| `knowledge_version` | kb_knowledge | ingest-service(INSERT) / vector-service(UPDATE) |
| `doc_acl` | kb_knowledge | ingest-service |
| `knowledge_space` | kb_knowledge | ingest-service |
| `knowledge_clean` | kb_knowledge | kb-doc-processor |
| `knowledge_structured` | kb_knowledge | kb-doc-processor |
| `embed_task` | kb_knowledge | kb-doc-processor(INSERT) / vector-service(UPDATE) |

---

## trace_id 规范

所有服务入口必须生成或传递 `trace_id`，格式 `tr-{uuid4}`，如 `tr-a1b2c3d4-e5f6-7890-abcd-ef1234567890`。全链路：前端 → gateway → ingest → Kafka → processor → Kafka → vector → Milvus。

---

## PHASE2 占位规则

一期禁止的功能（OCRParser、PIIFilter、BM25 等）必须标注占位：

- **Java**：`@Phase2Feature` 注解 + 构造方法 `throw new UnsupportedOperationException("PHASE2_PLACEHOLDER: ...")`
- **Python**：`__init__` 中 `raise NotImplementedError("PHASE2_PLACEHOLDER: ...")` + `# PHASE2:` 注释
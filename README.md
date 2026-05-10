# KB Platform — 企业AI知识库

基于 RAG 架构的企业级知识库平台，支持文档上传、智能分片、向量检索与带引用的可信问答。

**MVP 目标**：文档上传后 5 分钟内可检索，返回带引用来源的 AI 答案。

---

## 架构总览

```
kb-portal (Next.js)          ← 前端门户
    ↓ HTTP
kb-mcp/                      ← Java 微服务
├── kb-gateway               ← JWT 鉴权 & 路由
├── auth-adapter             ← OIDC 登录 + OBO Token
├── user-service             ← 用户上下文
├── ingest-service            ← 文档入库 (8081)
├── vector-service            ← 向量化 + Milvus (31002)
├── rag-service               ← RAG 检索 + 对话 (31005)
└── llm-gateway               ← LLM 路由 + 审计 (31004)
kb-doc-processor/            ← Python: 解析/清洗/切片 (31001)
rerank-service/              ← Python: BGE-Reranker (31003)
kb-infra/                    ← Docker Compose: PG / Redis / MinIO / Kafka / Milvus
```

### 两条核心链路

| 链路 | 流程 |
|------|------|
| **B — 入库** | Portal → ingest-service → Kafka(`file-ingest`) → doc-processor → Kafka(`embed-task`) → vector-service → Milvus |
| **A — 检索** | Portal → rag-service → Milvus → rerank → llm-gateway → Portal |

---

## 快速开始

```bash
# 1. 启动基础设施
cd kb-infra/docker-compose && docker compose up -d

# 2. 一键启动所有服务
./start-all.sh

# 或按服务启动
./start-all.sh ingest      # 仅启动 ingest-service
./start-all.sh --check     # 检查服务状态
```

### 前端开发

```bash
cd kb-portal/web
npm install
npm run dev                 # http://localhost:3105
```

### 后端开发

```bash
# Java 服务
cd kb-mcp/ingest-service
mvn clean package -DskipTests
# localhost:25432 是 Docker 容器 kb-postgres 暴露到宿主机的端口
DB_HOST=localhost DB_PORT=25432 DB_NAME=kb_knowledge \
DB_USERNAME=kb_ingest DB_PASSWORD=kb_ingest \
java -jar target/ingest-service-0.0.1-SNAPSHOT.jar

# Python 服务
cd kb-doc-processor
python -m venv .venv && .venv/bin/pip install -e .
.venv/bin/python -m src.main
```

---

## 技术栈

| 组件 | 版本 |
|------|------|
| Java / Spring Boot | 17 / 3.2.x |
| Python | 3.10+ |
| PostgreSQL | 15+ |
| Milvus | 2.4+ |
| Kafka | 3.6+ |
| MinIO | 2024+ |
| Redis | 7+ |
| Next.js (前端) | 14+ |

---

## 文档索引

完整文档见 [`docs/`](docs/) 目录，按以下分类组织：

| 类别 | 文档 | 说明 |
|------|------|------|
| 架构设计 | [实施手册](docs/architecture/implementation-handbook.md) | 系统架构、核心流程、数据模型、接口定义 |
| 架构设计 | [数据库分析报告](docs/architecture/database-design-analysis.md) | 逐表逐字段详解、数据扭转全流程 |
| 优化规划 | [优化方案路线图](docs/optimization/roadmap.md) | P0-P4 优先级排序的优化方向 |
| 功能方案 | [智能分片](docs/features/smart-chunking.md) | 规则引擎 + LLM 精修双层分片架构 |
| 功能方案 | [空间层级化](docs/features/space-hierarchy.md) | 知识空间自引用树形结构改造 |
| 功能方案 | [标签与分片类型](docs/features/tags-and-chunk-type.md) | Milvus tags + chunk_type 检索增强 |
| 功能方案 | [扩展管理](docs/features/extension-management.md) | 提示词/Skills/MCP Servers 配置管理 |

---

## 项目约定

- **契约优先**：`contracts/` 目录为接口/消息格式的唯一定义来源
- **trace_id**：全链路格式 `tr-{uuid4}`，前端 → gateway → ... → Milvus
- **表所有权**：每个服务只能写入自己拥有的表（详见 CLAUDE.md）
- **PHASE2 占位**：一期禁止的功能必须标注占位（`@Phase2Feature` / `NotImplementedError`）

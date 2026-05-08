# 企业AI知识库 MVP 实施手册

> 文档版本：V2.0（基于技术方案优化）
> 更新日期：2026年4月27日
> 状态：待领导确认

---

## 一、文档目标

本文档为企业AI知识库系统的 **MVP 实施指南**，基于技术方案《企业AI知识库技术方案（Dify+统一用户体系+MCP）》提取核心内容，明确：

1. 系统架构与组件职责边界
2. 两条核心业务流程（入库、检索）
3. kb-doc-processor 模块化设计
4. 数据模型与接口定义
5. MVP 实施范围与里程碑

**MVP 成功标准：**

- 文档上传后 **5分钟内** 可被检索
  > **前提条件：** 单个文件 ≤ 30页 / ≤ 5MB；并发入库 ≤ 5个任务；队列无积压
  > **MVP限制：**
  > ```yaml
  > mvp_limits:
  >   max_file_pages: 30        # 单文件最大页数
  >   max_file_size_mb: 5       # 单文件最大体积
  >   ocr_disabled: true        # MVP关闭OCR，仅支持文字型PDF/Word
  >   embedding_batch_size: 32  # vector-service批量向量化
  >   processor_replicas: 3     # Kafka consumer group水平扩展
  >   max_retry: 3              # 单任务最大重试次数
  > ```
  > 超时告警：入库超 10 分钟未完成则触发告警
- 用户提问返回带引用的可信答案
- 文档更新后旧版本自动软下线，避免召回过期内容
- 全链路 trace_id 贯穿（前端→网关→ingest→processor→vector→Milvus）

---

## 二、架构总览

### 2.0 整体工程结构

```
kb-platform/                          ← 根工程 (仓库)
│
├── kb-mcp/                           ← Java 微服务集合
│   ├── kb-gateway/                   ← 网关 (SCG + OIDC JWT校验)
│   ├── auth-adapter/                 ← 认证适配器 (OIDC + Token Exchange)
│   ├── user-service/                 ← 用户服务 (组织/用户/角色/权限组)
│   ├── ingest-service/               ← 文档入库服务 (接口层)
│   ├── vector-service/               ← 向量服务 (embedding调用 + Milvus upsert)
│   └── rag-service/                  ← RAG服务 (检索 + 生成)
│
├── kb-doc-processor/             ← Python 工程
│   ├── parsers/                      │   ● TikaParser (PDF/Word/PPT/Excel)
│   │   └── ocr_parser.py             │   ● OCRParser (扫描件)
│   ├── cleaners/                     │   ● TextCleaner
│   │   └── pii_filter.py             │   ● PIIFilter (脱敏)
│   ├── chunkers/                     │   ● SemanticChunker
│   │   └── fixed_chunker.py          │   ● FixedLengthChunker
│   ├── api/                          │   HTTP API (parse/clean/chunk)
│   └── kafka_consumer.py             ← Kafka Consumer (消费 file-ingest → 发布 embed-task)

├── kb-infra/                         ← 基础设施
│   ├── docker-compose/               │   PostgreSQL / Redis / MinIO / Kafka / Milvus
│   └── init-db/                      │   数据库初始化脚本
│
└── kb-portal/                        ← 前端工程
    └── web/                          │   知识库管理门户
```

> **重要：** `kb-doc-processor` 和 `ingest-service` 是**并列关系**，不相互包含。
> - `ingest-service`：Java 服务，提供入库接口，发布 `file-ingest` 消息
> - `kb-doc-processor`：Python 工程，**以 Kafka Consumer 为主**，同时也提供 HTTP API（用于解析/清洗/切片），完成后发布 `embed-task` 消息
> - `vector-service`：Java 服务，消费 `embed-task` 消息，调用 embedding-service 向量化后写入 Milvus

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                     用户层                                          │
│            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│            │  知识库门户   │  │  上层应用    │  │  智脑/IM     │                 │
│            │  (Web/App)   │  │  (Dify等)   │  │   机器人     │                 │
│            │  OIDC登录    │  │  OIDC登录    │  │              │                 │
│            └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
└────────────────────┼────────────────┼────────────────┼─────────────────────────┘
                     │                │                │
                     │ OIDC           │ OBO Token      │ OBO Token
                     ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                     网关层                                          │
│                                                                                     │
│                         ┌──────────────────────┐                                   │
│                         │   gateway-service    │                                   │
│                         │   (SCG + OIDC JWT)   │                                   │
│                         │                      │                                   │
│                         │  ● iss 白名单校验     │                                   │
│                         │  ● aud 路由隔离       │                                   │
│                         │  ● scope 权限校验     │                                   │
│                         │  ● tenant 绑定       │                                   │
│                         └──────────┬───────────┘                                   │
└────────────────────────────────────┼────────────────────────────────────────────────┘
                                     │
                                     │ HTTP/gRPC
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    认证层                                           │
│                                                                                     │
│                         ┌──────────────────────┐                                   │
│                         │  auth-adapter       │                                   │
│                         │  (OIDC + TokenExchg) │                                   │
│                         │                      │                                   │
│                         │  ● OIDC 标准端点     │                                   │
│                         │  ● RFC8693 OBO      │                                   │
│                         │  ● 桥接 BladeX      │                                   │
│                         └──────────┬───────────┘                                   │
│                                    │                                               │
│                                    │ 上游 OAuth2 + userinfo/introspection            │
│                                    ▼                                               │
│                         ┌──────────────────────┐                                   │
│                         │   BladeX OAuth2      │                                   │
│                         │   (公司统一认证)       │                                   │
│                         └──────────────────────┘                                   │
│                                                                                     │
│  OBO Token 说明：                                                                   │
│    ● 上层应用用 user_access_token 换 OBO token (aud=mcp-kb, exp=5min)             │
│    ● OBO token 携带用户上下文 (tenant/dept/role/sec_level)                         │
│    ● KB MCP 只认 OBO token，不接受自定义用户头                                     │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ OBO Token (aud=mcp-kb)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   业务层                                           │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                           KB MCP (Java 微服务)                                │  │
│  │                                                                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │ingest-service│  │vector-service│  │rag-service  │  │search-service│       │  │
│  │  │             │  │             │  │             │  │  (二期启用)  │       │  │
│  │  │●init-upload│  │●embedding  │  │●rewrite    │  │●BM25       │       │  │
│  │  │●commit     │  │●Milvus upsert│  │●retrieve  │  │●hybrid     │       │  │
│  │  │●ingest     │  │             │  │●rerank(可选)│  │            │       │  │
│  │  │●状态机     │  │             │  │●prompt    │  │            │       │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────┘       │  │
│  │         │                │                │                               │  │
│  │         │  Kafka        │                │                               │  │
│  │         ▼                │                │                               │  │
│  │  ┌─────────────┐        │                │                               │  │
│  │  │file-ingest │        │                │                               │  │
│  │  │embed-task  │        │                │                               │  │
│  │  └──────┬──────┘        │                │                               │  │
│  │         │               │                │                               │  │
│  └─────────┼───────────────┼────────────────┼───────────────────────────────┘  │
│            │               │                │                                    │
│            ▼               ▼                ▼                                    │
│  ┌─────────────────────┐ ┌─────────────┐ ┌─────────────┐                            │
│  │  kb-document-      │ │  embedding   │ │   llm       │                            │
│  │  processor          │ │ -service    │ │ -gateway    │                            │
│  │  (Python工程)       │ │ (推理服务)   │ │ (大模型网关) │                            │
│  │                     │ │             │ │             │                            │
│  │  ● Parser           │ │  ● BGE      │ │  ● 路由     │                            │
│  │  ● Cleaner          │ │  ● bge-rer  │ │  ● 审计     │                            │
│  │  ● Chunker          │ │    (可选)   │ │             │                            │
│  └──────────┬─────────┘ └──────┬─────┘ └──────┬─────┘                            │
│              │                  │               │                                   │
│              │ Kafka            │               │                                   │
│              ▼ (embed-task)     │               │                                   │
│              │                  │               │                                   │
│              └──────────────────┼───────────────┼───────────────────────────────────┘
            │                  │               │
            ▼                  ▼               ▼
┌─────────────────────┐  ┌─────────────┐  ┌─────────────┐
│       MinIO          │  │   Milvus     │  │  LLM        │
│    (文件存储)         │  │  (向量库)    │  │  (外部)     │
│                     │  │             │  │             │
│  ● 原始文件          │  │  ● 向量检索  │  │             │
│  ● 解析后备份        │  │  ● ACL预过滤 │  │             │
│                     │  │             │  │             │
│  路径:              │  │  HNSW索引   │  │             │
│  kb-raw/{tenant}/   │  │  M=32       │  │             │
│    {biz_domain}/    │  │  efC=200    │  │             │
│    {yyyy}/{mm}/    │  │             │  │             │
│    {doc_id}/       │  │             │  │             │
└─────────────────────┘  └──────┬──────┘  └─────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   数据层                                           │
│                                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ PostgreSQL  │  │    Redis     │  │    Kafka     │  │ Elasticsearch│          │
│  │   15+       │  │    7+        │  │   3.6+       │  │   8.x        │          │
│  │              │  │              │  │              │  │  (二期启用)   │          │
│  │ ● auth      │  │ ● 用户上下文  │  │ ● file-ingest│  │ ● BM25      │          │
│  │ ● user      │  │ ● JWKS缓存   │  │ ● embed-task │  │ ● 审计日志   │          │
│  │ ● knowledge │  │ ● ACL缓存    │  │ ● user-cud   │  │              │          │
│  │ ● audit     │  │              │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 组件职责边界

| 组件 | 语言/框架 | 职责 | 边界 |
|-----|----------|------|------|
| **gateway-service** | Java/Spring Cloud Gateway | 入口鉴权：iss/aud/scope/tenant 校验 | 仅校验不过滤，不执行业务逻辑 |
| **auth-adapter** | Java/Spring Boot | OIDC登录、Token Exchange (OBO)、桥接BladeX | 仅做认证，不执行业务逻辑 |
| **user-service** | Java | 用户上下文聚合、perm_group 管理 | 仅用户/权限数据，不涉及知识库业务 |
| **ingest-service** | Java | init-upload/commit/ingest 接口、状态机 | 不处理文件，只管理元数据和触发流水线 |
| **vector-service** | Java | 消费 embed-task 消息、调用 embedding-service、Milvus upsert | 仅向量入库，不做解析 |
| **rag-service** | Java | rewrite→retrieve→prompt→LLM | 不直接访问存储，仅调用下游服务 |
| **kb-doc-processor** | Python | 文件解析(Tika/OCR)、清洗、切片 | Kafka Consumer 异步处理，完成后发 embed-task 消息 |
| **embedding-service** | Python/TorchServe | 向量化推理 | 服务端固定模型，不接受调用方传 model |
| **llm-gateway** | Java/Python | LLM 路由、审计 | 仅路由和审计，不生成答案 |

### 2.3 服务间调用关系

```
上层应用/门户 ──OBO Token──> gateway ──> KB MCP
                                       │
                                       ├─> ingest-service ──> Kafka(file-ingest)
                                       │                         │
                                       │                    kb-doc-processor
                                       │                    (Parser/Cleaner/
                                       │                     Chunker)
                                       │                         │
                                       │                    Kafka(embed-task)
                                       │                         │
                                       ├─> vector-service ──> embedding-service ──> Milvus
                                       │
                                       ├─> rag-service ──> Milvus ──> llm-gateway ──> LLM
                                       │
                                       └─> user-service (获取用户上下文)

解析完成后通过 embed-task 消息触发 vector-service 进行向量化。
```

---

## 三、核心流程

### 3.1 流程一：知识入库（链路B）

**业务场景：** 用户上传文档 → 5分钟内可被检索

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               知识入库流程 (链路B)                                    │
│                                                                                     │
│  参与者：上传者 / 知识库门户 / ingest-service / MinIO / Kafka / kb-doc-processor /        │
│         vector-service / embedding-service / Milvus / PostgreSQL                   │
└─────────────────────────────────────────────────────────────────────────────────────┘

阶段1: 上传准备
─────────────────────────────────────────────────────────────────────────────────────

  上传者 ──> 知识库门户 ──> ingest-service ──> MinIO
    │            │              │              │
    │ ① 选择文件  │              │              │
    │   + 元数据  │              │              │
    │   (doc_type│              │              │
    │    biz_domai│              │              │
    │    region   │              │              │
    │    sec_level│              │              │
    │    effective│              │              │
    │ ─────────> │              │              │
    │            │              │              │
    │            │ ② init-upload│              │
    │            │   (tenant+   │              │
    │            │    元数据)    │              │
    │            │ ───────────> │              │
    │            │              │              │
    │            │              │ ③ 幂等检查   │
    │            │              │   tenant+    │
    │            │              │   sha256     │
    │            │              │ <─────────── │
    │            │              │              │
    │            │              │ ④ 申请MinIO  │
    │            │              │   presigned  │
    │            │              │   URL        │
    │            │              │ ──────────> │
    │            │              │              │
    │            │              │ ⑤ 返回URL   │
    │            │              │ <─────────< │
    │            │              │              │
    │            │ ⑥ 返回上传界面│              │
    │            │   (presigned │              │
    │            │    URL)      │              │
    │ <─────────────────────── │              │
    │            │              │              │

阶段2: 文件上传 (直传MinIO)
─────────────────────────────────────────────────────────────────────────────────────

    │            │              │              │
    │ ⑦ 浏览器直传│              │              │
    │   文件到    │              │              │
    │   MinIO    │              │              │
    │   (无需经过 │              │              │
    │    服务端)  │              │              │
    │ ──────────────────────────────────────────>│
    │            │              │              │
    │ ⑧ 上传完成 │              │              │
    │ <──────────────────────────────────────────│
    │            │              │              │

阶段3: 提交入库
─────────────────────────────────────────────────────────────────────────────────────

    │            │              │              │
    │ ⑨ 点击提交 │              │              │
    │   (附ACL)  │              │              │
    │ ─────────> │              │              │
    │            │              │              │
    │            │ ⑩ commit    │              │
    │            │   doc_id+   │              │
    │            │   sha256+   │              │
    │            │   元数据+    │              │
    │            │   owner_uid │              │
    │            │ ───────────> │              │
    │            │              │              │
    │            │              │ ⑪ PG写入    │
    │            │              │   knowledge_ │
    │            │              │   doc        │
    │            │              │   状态=DRAFT │
    │            │              │ <────────── │
    │            │              │              │
    │            │              │ ⑫ 写ACL    │
    │            │              │   doc_acl   │
    │            │              │ <────────── │
    │            │              │              │
    │            │              │ ⑬ Kafka    │
    │            │              │   file-     │
    │            │              │   ingest    │
    │            │              │ ──────────> │
    │            │              │              │
    │            │ ⑭ 返回结果   │              │
    │            │   doc_id     │              │
    │            │   version=1  │              │
    │            │   status=    │              │
    │            │   PENDING    │              │
    │ <─────────────────────── │              │
    │            │              │              │

阶段4: 异步解析流水线
─────────────────────────────────────────────────────────────────────────────────────

                    kb-doc-processor (Kafka Consumer)
                    ┌─────────────────────────────────────┐
                    │                                     │
                    │ ⑮ 消费 file-ingest                  │
                    │                                     │
                    │   ┌─────────────────────────────┐   │
                    │   │ Parser (解析器)              │   │
                    │   │ 输入: MinIO 原始文件         │   │
                    │   │ 输出: 文本 + 页码 + 布局      │   │
                    │   │                             │   │
                    │   │ 支持:                        │   │
                    │   │   ● TikaParser (PDF/Word/   │   │
                    │   │     PPT/Excel)              │   │
                    │   │   ● OCRParser (扫描件)      │   │
                    │   │     Tesseract+EasyOCR       │   │
                    │   └──────────────┬──────────────┘   │
                    │                  │                  │
                    │   ┌──────────────▼──────────────┐   │
                    │   │ Cleaner (清洗器)            │   │
                    │   │ 输入: 解析后文本            │   │
                    │   │ 输出: 干净文本 + 质量分     │   │
                    │   │                             │   │
                    │   │ 支持:                        │   │
                    │   │   ● TextCleaner (编码/     │   │
                    │   │     特殊字符/HTML)          │   │
                    │   │   ● PIIFilter (脱敏)       │   │
                    │   │   ● QualityCleaner (评分)  │   │
                    │   └──────────────┬──────────────┘   │
                    │                  │                  │
                    │   ┌──────────────▼──────────────┐   │
                    │   │ Chunker (切片器)            │   │
                    │   │ 输入: 清洗后文本            │   │
                    │   │ 输出: chunks[]             │   │
                    │   │                             │   │
                    │   │ 支持:                        │   │
                    │   │   ● SemanticChunker        │   │
                    │   │     (按标题/段落边界)       │   │
                    │   │   ● FixedLengthChunker     │   │
                    │   │     (512 token, 10% overlap)│   │
                    │   └──────────────┬──────────────┘   │
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
                 PostgreSQL           Kafka              Milvus
                 ┌────────┐      ┌──────────┐       ┌──────────┐
                 │knowledge│      │embed-task│       │vectors   │
                 │_doc    │      │(chunks) │       │+metadata │
                 │knowledge│      └────┬─────┘       └────┬────┘
                 │_clean │           │                    │
                 │_struct│           ▼                    │
                 │_version│    ┌──────────┐              │
                 └────────┘    │embedding │              │
                                │-service  │              │
                                │ (BGE)    │              │
                                └────┬─────┘              │
                                     │                    │
                                     │ ⑯ Milvus upsert   │
                                     │   (向量+metadata)  │
                                     │   perm_group_id    │
                                     │   acl_version      │
                                     │   sec_level        │
                                     │   region_code      │
                                     │ <─────────────────│
                                     │                    │
                                     │ ⑰ 更新状态=READY  │
                                     │   knowledge_version│
                                     │ <─────────────────│
                                     │                    │

阶段5: 状态查询
─────────────────────────────────────────────────────────────────────────────────────

    │            │              │              │
    │ ㉑ 刷新页面│              │              │
    │   查看状态 │              │              │
    │ ─────────> │              │              │
    │            │              │              │
    │            │ ㉒ 查询状态  │              │
    │            │ ───────────> │              │
    │            │              │              │
    │            │ ㉓ 返回状态  │              │
    │            │ <─────────── │              │
    │            │              │              │
    │ ㉔ 展示状态│              │              │
    │ <─────────────────────── │              │
    │            │              │              │
    │ 状态:                       │
    │ ● 待处理: "等待处理中..."    │
    │ ● 处理中: "正在解析文档..." │
    │ ● 成功:   "文档已上线，5分钟 │
    │          内可被搜到"         │
    │ ● 失败:   "处理失败 [查看   │
    │          日志 第X步]"        │
```

### 3.2 流程二：知识检索与问答（链路A）

**业务场景：** 用户提问 → 返回带引用的可信答案

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               知识检索与问答流程 (链路A)                              │
│                                                                                     │
│  参与者：查询者 / 上层应用(Dify/IM) / gateway / auth-adapter / rag-service /        │
│         vector-service / Milvus / llm-gateway / LLM                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

阶段1: OBO Token 获取
─────────────────────────────────────────────────────────────────────────────────────

  查询者 ──> 上层应用 ──> auth-adapter ──> BladeX
    │           │            │              │
    │ ① 输入问题 │            │              │
    │ ─────────>│            │              │
    │           │            │              │
    │           │ ② OIDC登录 │              │
    │           │ ──────────>│              │
    │           │            │              │
    │           │ ③ user_    │              │
    │           │    access  │              │
    │           │    token   │              │
    │           │<──────────│              │
    │           │            │              │
    │           │ ④ Token    │              │
    │           │    Exchange│              │
    │           │   (OBO)    │              │
    │           │ ──────────>│              │
    │           │            │              │
    │           │            │ ⑤ 验证      │
    │           │            │   user_token │
    │           │            │   查用户上下文│
    │           │            │ <────────── │
    │           │            │              │
    │           │ ⑥ OBO token│              │
    │           │   (aud=    │              │
    │           │    mcp-kb, │              │
    │           │    exp=5min│              │
    │           │<──────────│              │
    │           │            │              │

阶段2: 检索与生成
─────────────────────────────────────────────────────────────────────────────────────

    │           │            │              │              │              │
    │           │ ⑦ /rag/v1/ │              │              │              │
    │           │    chat    │              │              │              │
    │           │   query+   │              │              │              │
    │           │   OBO      │              │              │              │
    │           │ ──────────>│              │              │              │
    │           │            │              │              │              │
    │           │ ⑧ 验证OBO  │              │              │              │
    │           │   aud/scope│              │              │              │
    │           │<──────────│              │              │              │
    │           │            │              │              │              │
    │           │            │ ⑨ Query改写  │              │              │
    │           │            │   (同义词扩展) │              │              │
    │           │            │              │              │              │
    │           │            │ ⑩ 关键词兜底  │              │              │
    │           │            │   (精确匹配   │              │              │
    │           │            │ 条款编号/名称) │              │              │
    │           │            │ ─────────────>│              │              │
    │           │            │              │              │              │
    │           │            │ ⑪ Milvus    │              │              │
    │           │            │   检索 Top20  │              │              │
    │           │            │   +ACL预过滤 │              │              │
    │           │            │ ────────────>│              │              │
    │           │            │              │              │              │
    │           │            │ ⑫ Rerank   │              │              │
    │           │            │   Top20→Top5 │              │              │
    │           │            │ ────────────>│              │              │
    │           │            │              │              │              │
    │           │            │ ⑬ ACL二次校验│              │              │
    │           │            │   doc_acl表  │              │              │
    │           │            │ ────────────>│              │              │
    │           │            │              │              │              │
    │           │            │ ⑭ 拒答判断   │              │              │
    │           │            │              │              │              │
    │           │            │ ┌─────┐  ┌────┐              │              │
    │           │            │ │召回=0│  │召回│              │              │
    │           │            │ │或全被│  │>0  │              │              │
    │           │            │ │拒绝 │  │     │              │              │
    │           │            │ │     │  │     │              │              │
    │           │            │ │拒答 │  │下一步│              │              │
    │           │            │ └──┬──┘  └──┬─┘              │              │
    │           │            │    │         │                │              │
    │           │            │    │         ▼                │              │
    │           │            │    │    ┌───────────┐         │              │
    │           │            │    │    │构造Prompt │         │              │
    │           │            │    │    │+引用块    │         │              │
    │           │            │    │    └─────┬─────┘         │              │
    │           │            │    │          │                │              │
    │           │            │    │          ▼                │              │
    │           │            │    │    ┌───────────┐         │              │
    │           │            │    │    │ llm-gateway│         │              │
    │           │            │    │    │ (路由+审计)│         │              │
    │           │            │    │    └─────┬─────┘         │              │
    │           │            │    │          │                │              │
    │           │            │    │          ▼                │              │
    │           │            │    │    ┌───────────┐         │              │
    │           │            │    │    │ LLM生成   │         │              │
    │           │            │    │    └─────┬─────┘         │              │
    │           │            │    │          │                │              │
    │           │ ⑮ 返回答案 │<───┼──────────┼────────────────│              │
    │           │   +引用    │    │          │                │              │
    │           │   +trace_id│    │          │                │              │
    │ <──────────────────────│    │          │                │              │
    │           │            │    │          │                │              │
    │ ⑯ 展示结果│            │    │          │                │              │
    │ <─────────│            │    │          │                │              │
    │           │            │    │          │                │              │
    │ ┌─────────────────────────────────────────────────────────┐│
    │ │ 问：采购合同审批流程是什么？                              ││
    │ │                                                         ││
    │ │ 答：根据《采购管理办法》...                               ││
    │ │                                                         ││
    │ │ 来源：                                                   ││
    │ │ ①《采购管理办法》v7                                     ││
    │ │    第3页 / 1.2.3节                                      ││
    │ │    生效日期：2026-01-01  适用地域：全国                  ││
    │ │                                                         ││
    │ │ ②《采购合同管理指引》v2                                  ││
    │ │    第5页 / 2.1节                                        ││
    │ └─────────────────────────────────────────────────────────┘│
```

### 3.3 拒答判断逻辑

| 条件 | 判断 | 委婉表达 |
|-----|------|---------|
| 召回为空 | 知识库确实没有相关内容 | "知识库中暂时没有找到相关资料" |
| ACL 过滤后全部被拒 | 有内容但用户无权访问 | "您没有权限查看相关内容" |
| 证据分低于阈值 | 召回质量差 | "知识库中暂时没有找到相关资料" |

> 所有拒答均返回 trace_id，供管理员审计

---

## 四、知识分层模型

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               知识分层模型                                          │
│                                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   Raw层     │ ──> │  Clean层    │ ──> │  Struct层   │ ──> │  Vector层   │       │
│  │ (原始数据)   │     │  (清洗数据)  │     │ (结构化数据) │     │  (向量数据)  │       │
│  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘       │
│        │                   │                   │                   │              │
│        ▼                   ▼                   ▼                   ▼              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   MinIO     │     │knowledge_   │     │knowledge_   │     │   Milvus     │       │
│  │   S3兼容    │     │  clean      │     │structured   │     │   向量库     │       │
│  │             │     │             │     │             │     │             │       │
│  │ ● 原始文件   │     │ ● 清洗文本  │     │ ● 标题层级  │     │ ● embedding │       │
│  │ ● 版本快照   │     │ ● 质量评分  │     │ ● 表格结构  │     │ ● metadata  │       │
│  │ ● 幂等hash  │     │ ● 页码锚点  │     │ ● 实体识别  │     │ ● ACL字段   │       │
│  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘       │
│                                                                                     │
│  存储路径: s3://kb-raw/{tenant}/{biz_domain}/{source_type}/{yyyy}/{mm}/{doc_id}/ │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

| 层级 | 存储 | 内容 | 说明 |
|-----|------|------|------|
| **Raw** | MinIO | 原始文件 | 幂等键: tenant + sha256 |
| **Clean** | PostgreSQL / MinIO | 统一文本 + 页码 + 质量分 | 大文档(>100KB)存MinIO，PG存引用 |
| **Structured** | PostgreSQL | 标题/表格/实体/ bbox | JSONB 格式 |
| **Vector** | Milvus | embeddings + metadata | HNSW 索引 |

---

## 五、kb-doc-processor 模块化设计

### 5.1 kb-doc-processor 在架构中的位置

```
kb-doc-processor 以 **Kafka Consumer 为主**（异步批量处理），同时也提供 HTTP API（用于直接调用解析/清洗/切片能力）。

主要流程：消费 `file-ingest` 消息 → Parser → Cleaner → Chunker → 发布 `embed-task` 消息

HTTP API 作为补充：用于单独调用 parse/clean/chunk 能力（如：实时预览解析结果、调试等）

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│   方式一: HTTP API (直接调用)                                                        │
│   ─────────────────────────────────────────────────────────────────────────────────  │
│   ingest-service ──> kb-doc-processor/api/v1/parse ──> Parser ──> Cleaner ──> Chunker│
│                                            │                                        │
│                                            ▼                                        │
│                                      返回 chunks[]                                   │
│                                                                                     │
│   方式二: Kafka Consumer (异步批量)                                                  │
│   ─────────────────────────────────────────────────────────────────────────────────  │
│   ingest-service ──> Kafka(file-ingest) ──> kb-doc-processor ──> Parser ──>        │
│                                          Cleaner ──> Chunker ──> Kafka(embed-task)   │
│                                                                            │         │
│                                                                            ▼         │
│                                                        vector-service ──> embedding │
└─────────────────────────────────────────────────────────────────────────────────────┘

### 5.2 模块接口定义

#### 5.2.1 Parser (解析器)

```python
class IParser(ABC):
    """解析器标准接口"""
    
    @property
    def name(self) -> str:
        pass
    
    @property
    def supported_types(self) -> List[str]:
        """支持的文件类型: pdf, docx, pptx, xlsx, jpg, png, md, txt"""
        pass
    
    def parse(self, file_path: str, options: dict) -> ParseResult:
        """
        解析文件
        输入: 文件路径 (MinIO S3路径)
        输出: ParseResult(
                text: str,           # 纯文本
                pages: List[Page],   # [{"page_num": 1, "text": "...", "bbox": [...]}]
                metadata: dict       # {"title": "", "author": "", "parse_method": "TIKA"}
              )
        """
        pass

class TikaParser(IParser):
    """Apache Tika 解析器 - PDF/Word/PPT/Excel/HTML/Markdown"""
    def __init__(self, tika_server_url: str = "http://tika:9998"):
        self.tika_server_url = tika_server_url

class OCRParser(IParser):
    """OCR 解析器 - 扫描件图片 (Tesseract + EasyOCR)"""
    def __init__(self, lang: str = "chi_sim+eng"):
        self.lang = lang
```

#### 5.2.2 Cleaner (清洗器)

```python
class ICleaner(ABC):
    """清洗器标准接口"""
    
    @property
    def name(self) -> str:
        pass
    
    def clean(self, text: str, metadata: dict) -> CleanResult:
        """
        清洗文本
        输入: 原始文本 + 页码/标题等元数据
        输出: CleanResult(
                cleaned_text: str,
                quality_score: float,  # 0-100
                issues: List[str]      # ["低置信度OCR", "含有敏感信息"]
              )
        """
        pass

class TextCleaner(ICleaner):
    """文本标准化清洗器"""
    def clean(self, text, metadata):
        # 1. 编码标准化 (UTF-8)
        # 2. 特殊字符处理
        # 3. HTML标签去除
        # 4. 连续空白压缩
        # 5. 页眉页脚去除
        pass

class PIIFilter(ICleaner):
    """敏感信息脱敏清洗器"""
    def clean(self, text, metadata):
        # 1. 身份证号脱敏: \d{17}[\dXx] -> ****
        # 2. 电话号码脱敏: \d{11} -> ****
        # 3. 邮箱脱敏
        pass
```

#### 5.2.3 Chunker (切片器)

```python
class IChunker(ABC):
    """切片器标准接口"""
    
    @property
    def name(self) -> str:
        pass
    
    def chunk(self, text: str, metadata: dict) -> List[Chunk]:
        """
        切片
        输入: 清洗后文本 + 元数据
        输出: List[Chunk(
                chunk_seq: int,
                text: str,
                section_path: str,  # "1/1.2/1.2.3"
                page: int,
                char_count: int,
                token_count: int
              )]
        """
        pass

class SemanticChunker(IChunker):
    """语义切片器 - 按标题/段落边界切分，保持语义完整"""
    def __init__(self, min_chunk_size: int = 50, max_chunk_size: int = 512):
        self.min_chunk_size = min_chunk_size
        self.max_chunk_size = max_chunk_size

class FixedLengthChunker(IChunker):
    """固定长度切片器 - token_count 或 char_count"""
    def __init__(self, chunk_size: int = 512, overlap: int = 51):
        self.chunk_size = chunk_size
        self.overlap = overlap  # overlap_ratio = overlap / chunk_size = 10%
```

> **注意：** kb-doc-processor 只包含 Parser、Cleaner、Chunker 模块。
> 向量化由 **vector-service** 调用 **embedding-service** 完成，不在 kb-doc-processor 内。

### 5.3 HTTP API 接口

#### 5.3.1 parse 接口

```
POST /api/v1/parse
Content-Type: multipart/form-data
```

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| file | File | ✅ | 上传文件 (PDF/Word/PPT/Excel/图片等) |
| parse_method | string | ❌ | "TIKA" / "OCR"，不传则自动选择 |
| lang_hints | string[] | ❌ | 语言提示 ["zh", "en"] |

**响应：**

```json
{
  "docId": "DOC123",
  "pages": [
    {
      "pageNum": 1,
      "text": "这是第一页的文本内容...",
      "width": 595,
      "height": 842
    }
  ],
  "metadata": {
    "title": "文档标题",
    "author": "作者",
    "pageCount": 10,
    "parseMethod": "TIKA"
  },
  "traceId": "tr-xxx"
}
```

#### 5.3.2 clean 接口

```
POST /api/v1/clean
Content-Type: application/json
```

**请求：**

```json
{
  "text": "原始文本内容...",
  "lang": "zh",
  "metadata": {
    "pageNum": 1,
    "title": "文档标题"
  }
}
```

**响应：**

```json
{
  "cleanedText": "清洗后的文本...",
  "qualityScore": 85.5,
  "issues": [],
  "traceId": "tr-xxx"
}
```

#### 5.3.3 chunk 接口

```
POST /api/v1/chunk
Content-Type: application/json
```

**请求：**

```json
{
  "text": "长文本内容...",
  "chunkType": "semantic",
  "metadata": {
    "pageNum": 1,
    "sectionPath": "1/1.2"
  }
}
```

**响应：**

```json
{
  "chunks": [
    {
      "chunkSeq": 0,
      "text": "切片1的内容...",
      "sectionPath": "1/1.2",
      "page": 1,
      "charCount": 512,
      "tokenCount": 128
    }
  ],
  "totalChunks": 5,
  "traceId": "tr-xxx"
}
```

#### 5.3.4 process 接口 (一体化)

```
POST /api/v1/process
Content-Type: multipart/form-data
```

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| file | File | ✅ | 上传文件 |
| chunk_type | string | ❌ | "semantic" / "fixed_length"，默认 semantic |

**响应：**

```json
{
  "docId": "DOC123",
  "chunks": [
    {
      "chunkSeq": 0,
      "text": "切片内容...",
      "page": 1,
      "charCount": 512
    }
  ],
  "totalChunks": 10,
  "qualityScore": 85.5,
  "traceId": "tr-xxx"
}
```

### 5.4 配置示例

```yaml
# kb-doc-processor 配置
kb_document_processor:
  parsers:
    - name: TikaParser
      enabled: true
      priority: 1
      supported_types: [pdf, doc, docx, ppt, pptx, xls, xlsx, txt, md, html]
    - name: OCRParser
      enabled: true
      priority: 2
      supported_types: [jpg, png, tiff, bmp]

  cleaners:
    - name: TextCleaner
      enabled: true
      order: 1
    - name: PIIFilter
      enabled: true
      order: 2

  chunkers:
    - name: FixedLengthChunker
      enabled: true
      type: fixed_length  # MVP: 固定长度切片，降低实现复杂度
      chunk_size: 512
      overlap_ratio: 0.1
```

---

## 六、数据模型

### 6.1 PostgreSQL 表结构

#### 6.1.1 knowledge_doc (文档元数据)

```sql
CREATE TABLE kb_knowledge.knowledge_doc (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  version         INT NOT NULL DEFAULT 1,
  title           VARCHAR(256),
  source_type     VARCHAR(32) NOT NULL,  -- UPLOAD/CDC/CRAWL/API
  doc_type        VARCHAR(32) NOT NULL,  -- REGULATION/POLICY/AUDIT
  src_path        VARCHAR(512) NOT NULL,  -- MinIO S3路径
  sha256          CHAR(64) NOT NULL,      -- 幂等键
  owner_uid       VARCHAR(64),            -- 上传者
  dept_id         VARCHAR(64),
  sec_level       INT NOT NULL DEFAULT 1,
  region_code     VARCHAR(32) NOT NULL DEFAULT 'CN-NATIONAL',
  biz_domain      VARCHAR(64) NOT NULL DEFAULT 'COMPLIANCE',
  effective_from  DATE,
  effective_to    DATE,
  label_tags      TEXT,
| status          VARCHAR(16) NOT NULL,   -- DRAFT/PENDING/PROCESSING/READY/FAILED
  retry_count     INT NOT NULL DEFAULT 0,   -- 重试次数
  last_error      TEXT,                      -- 最近一次错误信息
  create_time     TIMESTAMP NOT NULL DEFAULT now(),
  expire_time     TIMESTAMP,
  UNIQUE (tenant_id, doc_id, version)
);

CREATE INDEX idx_doc_tenant_status ON kb_knowledge.knowledge_doc (tenant_id, status);
CREATE INDEX idx_doc_tenant_seclevel ON kb_knowledge.knowledge_doc (tenant_id, sec_level);
```

#### 6.1.2 knowledge_clean (清洗层)

```sql
CREATE TABLE kb_knowledge.knowledge_clean (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  src_path        VARCHAR(512) NOT NULL,       -- MinIO 原始文件路径
  sha256          CHAR(64) NOT NULL,
  cleaned_text    TEXT,                         -- 小文档直接存文本 (≤100KB)
  clean_text_path VARCHAR(512),                 -- 大文档 (>100KB) 存 MinIO 路径，PG 只存引用
  language        VARCHAR(16) NOT NULL DEFAULT 'zh',
  parse_method    VARCHAR(32) NOT NULL DEFAULT 'TIKA',  -- TIKA/OCR
  quality_score   NUMERIC(5,2) NOT NULL DEFAULT 0,      -- 0-100
  meta_json       JSONB NOT NULL DEFAULT '{}',
  created_time    TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_id, sha256),
  CONSTRAINT chk_clean_text_or_path CHECK (
    (cleaned_text IS NOT NULL AND clean_text_path IS NULL) OR
    (cleaned_text IS NULL AND clean_text_path IS NOT NULL)
  )
);
```

#### 6.1.3 knowledge_structured (结构化层)

```sql
CREATE TABLE kb_knowledge.knowledge_structured (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  version         INT NOT NULL,
  json_body       JSONB NOT NULL,  -- {"sections": [{"section_path": "1/1.2", "page": 3, "paragraphs": [...]}]}
  extractor_ver   VARCHAR(32) NOT NULL DEFAULT 'v1',
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_id, version)
);
```

#### 6.1.4 knowledge_version (版本状态机)

```sql
CREATE TABLE kb_knowledge.knowledge_version (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            VARCHAR(64) NOT NULL,
  doc_id               VARCHAR(128) NOT NULL,
  version              INT NOT NULL,
  status               VARCHAR(16) NOT NULL,  -- PENDING/PROCESSING/READY/FAILED/OFFBOARDED/DEPRECATED
  created_by           VARCHAR(64) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT now(),
  deprecate_at         TIMESTAMP,              -- 计划下线时间
  superseded_by_version INT,                   -- 替代版本号
  UNIQUE (tenant_id, doc_id, version)
);

CREATE INDEX idx_version_tenant_status ON kb_knowledge.knowledge_version (tenant_id, status);
```

**版本切换策略（两阶段提交）：**
```
1. 新版本写入成功前，旧版本保持 READY
2. 新版本 READY 后，旧版本标记 DEPRECATED（软删除）
3. 5分钟后异步删除旧向量（Milvus delete by doc_id + version）
```

**解析失败重试策略：**
```
- 失败后 status=FAILED，retry_count + 1
- retry_count < max_retry(3) → 指数退避重试，版本号不变
- retry_count >= max_retry → 人工介入
- 新版本入库失败时，旧版本保持 READY 不受影响
```

#### 6.1.5 doc_acl (文档ACL)

```sql
CREATE TABLE kb_knowledge.doc_acl (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  accessor_type   VARCHAR(16) NOT NULL,  -- USER/ROLE/DEPT
  accessor_id     VARCHAR(128) NOT NULL,
  permission      VARCHAR(16) NOT NULL DEFAULT 'READ',  -- READ/WRITE/ADMIN
  acl_version     BIGINT NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, doc_id, accessor_type, accessor_id)
);

CREATE INDEX idx_acl_tenant_doc ON kb_knowledge.doc_acl (tenant_id, doc_id);
CREATE INDEX idx_acl_accessor ON kb_knowledge.doc_acl (accessor_type, accessor_id);
```

#### 6.1.6 数据归档策略（二期实施）

```sql
-- 归档表（与原表结构相同）
CREATE TABLE kb_knowledge.knowledge_doc_archive (LIKE kb_knowledge.knowledge_doc INCLUDING ALL);

-- 清理策略（二期实施）
-- FAILED 状态且 > 30 天 → 归档后删除原始记录
-- OFFBOARDED 状态且 > 90 天 → 删除 MinIO 原始文件
-- 审计日志保留 180 天
```

#### 6.1.5.1 文档版本更新流程

当文档发布新版本时，**旧版本自动软下线**：

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           文档版本更新流程                                          │
│                                                                                     │
│  1. 提交新版本 (commit with version=2)                                              │
│     └── knowledge_doc: version=2, status=PENDING                                   │
│     └── knowledge_version: version=2, status=PENDING                               │
│                                                                                     │
│  2. 新版本入库处理中                                                               │
│     └── kb-doc-processor: 解析 → 清洗 → 切片 → 发布 embed_task                   │
│     └── vector-service: 向量化 → Milvus upsert (version=2)                         │
│                                                                                     │
│  3. 新版本上线 (status=READY)                                                      │
│     └── knowledge_version: version=2, status=READY                                  │
│                                                                                     │
│  4. 旧版本自动软下线                                                               │
│     └── knowledge_version: version=1, status=OFFBOARDED                             │
│     └── Milvus: 删除 version=1 的所有向量 (by doc_id + version)                      │
│     └── PG doc_acl: 旧版本 ACL 保留（便于审计追溯）                                │
│                                                                                     │
│  5. 检索时自动排除 OFFBOARDED 版本                                                  │
│     └── effective_to 字段设置旧版本失效日期                                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### 6.1.6 embed_task (向量化任务队列)

```sql
CREATE TABLE kb_knowledge.embed_task (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  version         INT NOT NULL,
  chunk_seq       INT NOT NULL,
  text_hash       CHAR(64) NOT NULL,     -- 幂等键
  title           VARCHAR(256),
  section_path    VARCHAR(256),
  page            INT,
  dept_id         VARCHAR(64),
  sec_level       INT NOT NULL DEFAULT 1,
  region_code     VARCHAR(32) NOT NULL DEFAULT 'CN-NATIONAL',
  biz_domain      VARCHAR(64) NOT NULL DEFAULT 'COMPLIANCE',
  perm_group_id   BIGINT,
  acl_version     BIGINT NOT NULL DEFAULT 1,
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING/PROCESSING/DONE/FAILED
  milvus_pk       BIGINT,               -- Milvus主键
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 3,
  error_code      VARCHAR(64),
  error_msg       TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now(),
  processed_at    TIMESTAMP,
  UNIQUE (tenant_id, doc_id, version, chunk_seq, text_hash)
);

CREATE INDEX idx_embed_task_status ON kb_knowledge.embed_task (status, created_at);
```

#### 6.1.7 user_context_cache (用户上下文缓存)

```sql
CREATE TABLE kb_user.user_context_cache (
  uid             VARCHAR(64) PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  username        VARCHAR(128),
  display_name    VARCHAR(128),
  email           VARCHAR(256),
  role_codes      TEXT[],        -- PostgreSQL数组
  dept_ids        TEXT[],
  sec_level       INT NOT NULL DEFAULT 1,
  region_scopes   TEXT[],
  biz_domain_scopes TEXT[],
  perm_group_ids  BIGINT[],
  ctx_ver         BIGINT NOT NULL DEFAULT 1,
  ctx_hash        CHAR(64),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  cached_at       TIMESTAMP NOT NULL DEFAULT now(),
  expires_at      TIMESTAMP
);

CREATE INDEX idx_user_context_tenant ON kb_user.user_context_cache (tenant_id);
```

### 6.2 Milvus Collection 设计

```text
Collection: kb_documents

字段设计：
┌────────────────┬────────────────┬────────────────────────────────────────────┐
│ 字段名          │ 类型           │ 说明                                       │
├────────────────┼────────────────┼────────────────────────────────────────────┤
│ id             │ INT64 (PK, auto)│ Milvus自动生成                             │
│ doc_id         │ VARCHAR         │ 文档ID                                     │
│ tenant_id      │ VARCHAR         │ 租户ID (用于分区)                         │
│ version        │ INT32           │ 版本号                                     │
│ chunk_seq      │ INT32           │ 切片序号                                   │
│ vector         │ FLOAT_VECTOR   │ 文本向量 (dim=1024 for BGE-Zh)              │
│ text           │ VARCHAR         │ 原始文本片段 (max 4096)                     │
│ title          │ VARCHAR         │ 文档标题                                   │
│ section_path   │ VARCHAR         │ 章节路径 "1/1.2/1.2.3"                     │
│ page           │ INT32           │ 页码                                       │
│ sec_level      │ INT32           │ 文档密级 (ACL预过滤)                       │
│ region_code    │ VARCHAR         │ 地域码 (ACL预过滤)                         │
│ biz_domain     │ VARCHAR         │ 业务域 (ACL预过滤)                         │
| perm_group_id  | INT64           | 权限组ID (ACL预过滤，解决dept列表过长)     │

**perm_group_id 聚合说明：**
> Milvus `perm_group_id` 为单一 INT64 字段，但 `doc_acl` 支持 USER/ROLE/DEPT 多维度授权。
> 聚合逻辑由 **user-service** 在用户登录时或上下文刷新时完成：
> 1. 查询用户关联的所有角色（ROLE）、部门（DEPT）、以及直接授权的用户（USER）记录
> 2. 将 doc_acl 中的每条记录映射到一个唯一的 perm_group_id（支持 ROLE/DEPT/USER 混合）
> 3. 将用户所有 perm_group_ids 去重后通过 OBO token 传递给下游
> 4. 检索时 Milvus 使用 `perm_group_id in [pg1, pg2, ...]` 做 ACL 预过滤
>
> **实现要点：**
> - perm_group_id 生成策略：`hash(tenant_id + accessor_type + accessor_id) % 2^63`
> - user_context_cache.perm_group_ids 字段为 BIGINT[]，支持多权限组
> - 向量入库时，ingest-service 需将 doc_acl 展开为 chunk 级别的多条 perm_group_id 记录

| effective_from | VARCHAR         | 生效日期                                   │
│ effective_to   │ VARCHAR         │ 失效日期 (空=永久有效)                     │
│ owner_uid      │ VARCHAR         │ 上传者ID                                  │
│ acl_version    │ INT64           │ ACL版本号                                  │
│ create_time    │ INT64           │ 创建时间 (epoch)                           │
└────────────────┴────────────────┴────────────────────────────────────────────┘

索引设计：
┌────────────────────────────────────────────────────────────────────────────────┐
│ vector_index: HNSW (M=32, efConstruction=200)                                  │
│ filter_indexes: tenant_id, sec_level, perm_group_id, region_code, effective_to │
└────────────────────────────────────────────────────────────────────────────────┘

搜索语法示例：
┌────────────────────────────────────────────────────────────────────────────────┐
│ search(                                                                       │
│   vector=query_vector,                                                         │
│   filter="tenant_id == 't1' AND "                                             │
│           "sec_level <= 3 AND "                                               │
│           "perm_group_id in [101, 102] AND "                                  │
│           "(effective_to is null OR effective_to > '2026-04-27')",           │
│   topk=20  # 召回Top20后经Rerank精排至Top5                                   │
│ )                                                                             │
└────────────────────────────────────────────────────────────────────────────────┘

> **关键词兜底：** 用户查询包含条款编号（如"第3.2.1条"）、制度名称等精确词时，
> 优先在召回阶段做关键词匹配补充，避免纯向量检索对精确词弱势的问题。

---

## 七、接口定义

### 7.1 知识入库接口

#### 7.1.1 init-upload

```
POST /kb/v1/docs/init-upload
鉴权: OBO token (aud=mcp-kb, scope=kb:upload)
```

**请求:**
```json
{
  "tenantId": "t1",
  "filename": "采购管理办法.pdf",
  "fileSize": 1024000,
  "fileHash": "sha256:abc123...",
  "docType": "REGULATION",
  "bizDomain": "COMPLIANCE",
  "regionCode": "CN-NATIONAL",
  "secLevel": 1,
  "effectiveFrom": "2026-01-01",
  "ownerUid": "u123",
  "deptId": "D01"
}
```

**响应:**
```json
{
  "docId": "DOC123",
  "presignedUrl": "https://minio.../kb-raw/t1/.../DOC123/采购管理办法.pdf?signature=***
  "expireIn": 300
}
```

**MinIO 预签名安全策略：**
```yaml
minio_presigned_policy:
  content_length_range: [1, 5242880]  # 1 ~ 5MB
  eq: ["$Content-Type", "application/pdf"]  # 仅 PDF
  expiry: 300  # 5分钟内有效
```
> 上传完成后必须调用 `/kb/v1/docs/{doc_id}/verify-upload` 校验 file_size 和 sha256

#### 7.1.2 commit

```
POST /kb/v1/docs/{doc_id}/commit
鉴权: OBO token (aud=mcp-kb, scope=kb:upload)
```

**请求:**
```json
{
  "tenantId": "t1",
  "sha256": "abc123...",
  "acl": [
    {
      "accessorType": "USER",
      "accessorId": "u123",
      "permission": "READ"
    },
    {
      "accessorType": "DEPT",
      "accessorId": "D01",
      "permission": "READ"
    }
  ]
}
```

**响应:**
```json
{
  "docId": "DOC123",
  "version": 1,
  "status": "PENDING"
}
```

#### 7.1.3 ingest (触发入库)

```
POST /kb/v1/docs/{doc_id}/ingest
鉴权: OBO token (aud=mcp-kb, scope=kb:upload)
```

**响应:**
```json
{
  "docId": "DOC123",
  "version": 1,
  "status": "PENDING",
  "message": "入库任务已提交"
}
```

### 7.2 知识检索接口

#### 7.2.1 rag/chat

```
POST /rag/v1/chat
鉴权: OBO token (aud=mcp-kb, scope=kb:search)
```

**请求:**
```json
{
  "tenantId": "t1",
  "sessionId": "s-001",
  "biz": "audit",
  "lang": "zh",
  "query": "采购合同审批流程是什么？",
  "topK": 20
}
```

**响应 (成功):**
```json
{
  "answer": "根据《采购管理办法》...",
  "citations": [
    {
      "docId": "DOC123",
      "chunkSeq": 12,
      "title": "采购制度",
      "version": 7,
      "page": 3,
      "sectionPath": "1/1.2/1.2.3",
      "regionCode": "CN-NATIONAL",
      "effectiveFrom": "2026-01-01",
      "effectiveTo": null,
      "isCurrent": true,
      "score": 0.78,
      "text": "采购合同应按照以下流程审批..."
    }
  ],
  "traceId": "tr-xxx"
}
```

**响应 (拒答):**
```json
{
  "answer": "知识库中暂时没有找到相关资料",
  "citations": [],
  "traceId": "tr-xxx",
  "reason": "NO_MATCH"
}
```

### 7.2.2 检索缓存策略

```redis
# 精确缓存（tenant:query_hash，TTL=10分钟）
# 注意：缓存 key 必须包含 perm_group_ids 集合，检索结果需按权限过滤
cache_key = f"kb:search:{tenant_id}:{hash(query)}:{sorted(perm_group_ids)}"
```

### 7.3 幂等性与重试机制

| 场景               | 处理方式                                              |
| ------------------ | ----------------------------------------------------- |
| 相同 sha256 重复上传 | 返回已存在 doc_id，提示覆盖或确认                    |
| 相同文件不同元数据   | 跳过并记录冲突告警                                    |
| 入库任务失败重试     | status=FAILED，MAX_RETRY=3，指数退避，版本号不变      |
| retry_count >= MAX_RETRY | 标记 FAILED，人工介入处理                        |

---

## 八、Token 规范

### 8.1 user_access_token

```json
{
  "iss": "https://auth-adapter.example.com",
  "sub": "u123",
  "aud": "kb-portal-client",
  "exp": 1745760000,
  "iat": 1745756400,
  "scope": "openid profile",
  "tenant_id": "t1",
  "uid": "u123",
  "role_codes": ["USER", "DEPT_ADMIN"],
  "dept_ids": ["D01", "D02"],
  "sec_level": 3,
  "region": "CN-SH"
}
```

### 8.2 obo_access_token

```json
{
  "iss": "https://auth-adapter.example.com",
  "sub": "u123",
  "aud": "mcp-kb",
  "exp": 1745759400,
  "iat": 1745759100,
  "scope": "kb:search",
  "tenant_id": "t1",
  "uid": "u123",
  "role_codes": ["USER"],
  "dept_ids": ["D01"],
  "sec_level": 3,
  "perm_group_ids": [101, 102]
}
```

---

## 九、MVP 实施范围

### 9.1 一期纳入 (MVP)

| 模块 | 功能 | 优先级 |
|-----|------|:------:|
| auth-adapter | OIDC登录 + Token Exchange (OBO) | P0 |
| gateway | iss/aud/scope/tenant 校验 | P0 |
| ingest-service | init-upload + commit + ingest | P0 |
| kb-doc-processor | TikaParser + TextCleaner + **FixedLengthChunker** | P0 |
| vector-service | BGE向量化 + Milvus upsert | P0 |
| rag-service | dense检索 + 关键词兜底 + Rerank + ACL过滤 + citations + LLM | P0 |
| 门户前端 | 上传 + 元数据 + ACL + 触发入库 + 状态查看 | P0 |
| embedding-service + rerank-service | BGE向量化 + BGE-Reranker 精排 | P0 |
| 文档软下线 | OFFBOARDED 标记 + Milvus 向量删除 | P0 |

### 9.2 一期暂不纳入 (二期)

| 模块 | 说明 |
|-----|------|
| BM25 混合检索 | Elasticsearch BM25 |
| OCR 高级能力 | 扫描件处理 |
| 多模型路由 | embedding 多模型 |
| OPA 复杂策略 | ABAC |

---

## 十一、可观测性设计

### 11.1 监控指标

| 维度      | 指标名称                              | 说明                              |
| --------- | ------------------------------------- | --------------------------------- |
| 业务指标  | kb_doc_upload_total                  | 文档上传总数                      |
| 业务指标  | kb_doc_process_duration_seconds      | 文档处理耗时 P50/P95/P99          |
| 业务指标  | kb_search_latency_milliseconds        | 检索延迟 P50/P95/P99              |
| 技术指标  | kafka_consumer_lag                    | Consumer  Lag（告警阈值 > 1000）   |
| 技术指标  | milvus_qps                           | Milvus QPS                        |
| 技术指标  | embedding_p99                         | Embedding 服务 P99 延迟           |
| 技术指标  | embedding_5xx_rate                   | Embedding 5xx 错误率（告警 > 1%） |

### 11.2 日志规范

```yaml
# 结构化 JSON 日志格式（所有服务统一）
log_format:
  trace_id: string    # 全链路追踪 ID
  tenant_id: string   # 租户标识
  doc_id: string      # 文档标识
  step: string        # 当前步骤 (parse/clean/chunk/embed/upsert)
  duration_ms: int    # 耗时（毫秒）
  status: string      # success/failed
  error_code: string  # 错误码（失败时）
```

### 11.3 告警规则

| 告警规则                      | 阈值           | 处理方式                    |
| ----------------------------- | -------------- | --------------------------- |
| Consumer lag > 1000           | 立即告警       | 扩容 processor_replicas     |
| Embedding 5xx率 > 1%          | 立即告警       | 触发熔断，人工介入          |
| 入库耗时 > 10分钟             | 立即告警       | 检查 Tika/Embedding 状态   |
| 单日入库失败率 > 5%           | 次日早间告警    | 排查根因                   |

### 11.4 熔断与降级

```java
// Embedding 熔断示例（vector-service）
@CircuitBreaker(name = "embedding", fallbackMethod = "fallbackEmbedding")
public EmbeddingResponse embed(List<String> texts) { ... }

public void fallbackEmbedding(List<String> texts, Throwable t) {
    // 1. 记录到 dead_letter_queue
    // 2. 重要文档标记 FAILED，人工介入
    // 3. 非重要文档延迟重试
}
```

### 11.5 前端轮询策略

```javascript
// 文档状态轮询策略
polling_strategy:
  - 提交后立即轮询 /kb/v1/docs/{doc_id}/status
  - 间隔: 2秒(前30秒) → 5秒(30-120秒) → 30秒(2分钟后)
  - 超时: 10分钟后显示"处理超时，请联系管理员"
```

---

## 十二、技术选型

| 组件 | 版本 | 说明 |
|-----|------|------|
| Java | 17 | auth-adapter / gateway / KB MCP |
| Spring Boot | 3.2.x | 微服务基线 |
| Python | 3.10+ | kb-doc-processor |
| Kafka | 3.6+ | 消息队列 |
| PostgreSQL | 15+ | 关系数据库 |
| Milvus | 2.4+ | 向量数据库 |
| MinIO | 2024+ | S3兼容对象存储 |
| Redis | 7+ | 缓存 |
| BGE Embedding | bge-zh-v1.5 | 中文向量 1024维 |


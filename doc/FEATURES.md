# 功能进度总览

> 更新规则：每完成一个功能模块，立即更新本文件对应条目的状态。
> 状态说明：`✅ 已完成` | `🔄 进行中` | `📋 计划中` | `⏸ 暂缓（二期）`

---

## Sprint 0 — 治理框架与契约先行

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| 项目目录骨架创建 | ✅ 已完成 | 2026-04-27 | 所有服务目录已建立 |
| 根目录 CLAUDE.md（全局规则） | ✅ 已完成 | 2026-04-27 | 包含禁令、Kafka拓扑、表所有权、PHASE2规范 |
| 各服务 CLAUDE.md（局部规则） | ✅ 已完成 | 2026-04-27 | gateway/auth/user/ingest/vector/rag/processor/portal |
| contracts/openapi/ingest-service-v1.yaml | ✅ 已完成 | 2026-04-27 | init-upload/commit/ingest/verify-upload/status |
| contracts/openapi/rag-service-v1.yaml | ✅ 已完成 | 2026-04-27 | /rag/v1/chat，含拒答规范 |
| contracts/openapi/doc-processor-v1.yaml | ✅ 已完成 | 2026-04-27 | parse/clean/chunk/process |
| contracts/kafka-schemas/file-ingest-message.json | ✅ 已完成 | 2026-04-27 | ingest→processor 消息格式 |
| contracts/kafka-schemas/embed-task-message.json | ✅ 已完成 | 2026-04-27 | processor→vector 消息格式 |
| contracts/milvus/kb_documents_collection.py | ✅ 已完成 | 2026-04-27 | Collection定义+HNSW索引+ACL过滤示例 |
| kb-infra/init-db/02_service_users.sql | ✅ 已完成 | 2026-04-27 | 6个DB用户精确授权隔离 |
| doc/ 文档管理体系 | ✅ 已完成 | 2026-04-27 | FEATURES.md + CURRENT_SESSION.md |

---

## Sprint 1 — 基础设施

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| kb-infra Docker Compose（PG/Redis/MinIO/Kafka/Milvus） | ✅ 已完成 | 2026-04-27 | 全部容器化，端口规范 |
| kb-infra init-db 建表脚本 | ✅ 已完成 | 2026-04-27 | 004~007，含 knowledge_doc/knowledge_space/doc_acl/embed_task 等 |
| kb-infra init-db 服务用户授权 | ✅ 已完成 | 2026-04-27 | 6个DB用户精确授权隔离 |
| auth-adapter OIDC 登录端点 | 📋 计划中 | - | OIDC 标准端点 |
| auth-adapter OBO Token Exchange | 📋 计划中 | - | RFC 8693，桥接 BladeX |
| kb-gateway JWT 校验 Filter | 📋 计划中 | - | iss/aud/scope/tenant 校验 |
| kb-gateway StripCustomUserHeaderFilter | 📋 计划中 | - | 剥离自定义用户头 |
| user-service user_context_cache CRUD | 📋 计划中 | - | perm_group_id 聚合逻辑 |
| user-service user-cud Kafka 消费 | 📋 计划中 | - | 用户变更事件同步 |

---

## Sprint 2 — 入库链路（链路B前半段）

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| ingest-service init-upload 接口 | ✅ 已完成 | 2026-04-28 | MinIO presigned URL，前后端对接完成 |
| ingest-service verify-upload 接口 | ✅ 已完成 | 2026-04-28 | sha256 校验，前后端对接完成 |
| ingest-service commit 接口 | ✅ 已完成 | 2026-04-28 | 写 knowledge_doc + doc_acl |
| ingest-service ingest 接口 | ✅ 已完成 | 2026-04-28 | 发布 file-ingest Kafka 消息 |
| ingest-service status 查询接口 | ✅ 已完成 | 2026-04-28 | 前端轮询 |
| ingest-service listDocs 接口 | ✅ 已完成 | 2026-04-30 | GET /kb/v1/docs，按 spaceId 过滤 |
| ingest-service deleteDoc 接口 | ✅ 已完成 | 2026-04-30 | 删除 MinIO 文件 + DB 记录 |
| ingest-service labelTags 写入支持 | ✅ 已完成 | 2026-04-30 | InitUploadRequest + initUpload builder |
| kb-doc-processor Kafka Consumer | ✅ 已完成 | 2026-04-29 | 消费 file-ingest topic，手动 commit |
| kb-doc-processor TikaParser | ✅ 已完成 | 2026-04-29 | 通过 Tika Server HTTP API 解析 PDF/Word/PPT/Excel |
| kb-doc-processor TextCleaner | ✅ 已完成 | 2026-04-29 | 编码/特殊字符/HTML/页眉页脚/空行压缩 |
| kb-doc-processor FixedLengthChunker | ✅ 已完成 | 2026-04-29 | HEAD_FIRST/TAIL_FIRST/UNIFORM 三种模式 |
| kb-doc-processor SemanticChunker（智能分片规则引擎） | ✅ 已完成 | 2026-05-02 | 标题识别→章节分组→语义边界切分，支持中英文 8 种标题模式 |
| kb-doc-processor LLMChunker（LLM 精修层） | ✅ 已完成 | 2026-05-02 | MiniMax abab6.5s-chat 增强，LLM 失败自动回退规则引擎 |
| kb-doc-processor 发布 embed-task 消息 | ✅ 已完成 | 2026-04-29 | 每个 chunk 一条消息，符合 kafka-schemas 定义 |
| kb-doc-processor 分片查询端点 | ✅ 已完成 | 2026-05-02 | GET /api/v1/docs/{doc_id}/chunks，返回清洗文本+分片位置+状态 |
| kb-doc-processor HTTP API | ✅ 已完成 | 2026-04-29 | /api/v1/parse, /clean, /chunk, /process |
| kb-doc-processor Pipeline 编排 | ✅ 已完成 | 2026-04-29 | parse→clean→chunk→save DB→publish Kafka |
| Docker Compose Tika Server | ✅ 已完成 | 2026-04-29 | apache/tika:2.9.3.0-full，端口 29998 |
| kb_processor DB 用户 | ✅ 已完成 | 2026-04-29 | knowledge_clean/structured/embed_task 表权限 |

### 知识空间（Knowledge Space）

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| knowledge_space 表 | ✅ 已完成 | 2026-04-28 | 见 init-db/updates/007_knowledge_space_tables.sql |
| knowledge_doc.knowledge_space_id 列 | ✅ 已完成 | 2026-04-28 | 默认 DEFAULT |
| Space CRUD API | ✅ 已完成 | 2026-04-28 | /kb/v1/spaces（list/get/create/update/delete） |
| init-upload 支持 knowledgeSpaceId + chunkConfig | ✅ 已完成 | 2026-04-28 | 上传时选择空间 + 切片配置 |
| file-ingest-message.json 扩展 | ✅ 已完成 | 2026-04-28 | 新增 knowledgeSpaceId + chunkConfig |
| 空间 → 文档列表导航 | ✅ 已完成 | 2026-04-30 | 点击空间名/详情页按钮跳转过滤视图 |

---

## Sprint 3 — 向量化链路（链路B后半段）

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| embedding-service BGE 向量化接口 | ✅ 已完成 | 2026-04-29 | kb-doc-processor 内嵌调用 BGE HTTP 服务 |
| vector-service embed-task Kafka 消费 | ✅ 已完成 | 2026-04-29 | batch listener，batch_size=32 |
| vector-service Milvus upsert | ✅ 已完成 | 2026-04-29 | kb_documents collection，含全部 ACL 预过滤字段 |
| vector-service 更新 knowledge_version 状态 | ✅ 已完成 | 2026-04-29 | 全部 chunk DONE → READY |
| vector-service 更新 embed_task 状态 | ✅ 已完成 | 2026-04-29 | PENDING → DONE/FAILED |
| vector-service 版本软下线（OFFBOARDED） | ⏸ 暂缓（二期） | - | PHASE2 |
| vector-service 熔断降级 | ⏸ 暂缓（二期） | - | PHASE2 |
| kb_documents 标签与语义字段 | 📋 计划中 | - | tags + chunk_type 设计已写入 contracts/milvus/ |

### 标签与语义字段（`kb_documents` Collection 扩展）

> 设计动机：当前向量检索只有 `vector + text + ACL`，缺少两个关键维度：**标签维度**（用户无法按业务标签过滤）和**语义维度**（向量盲区，两段文本词汇重叠但含义不同）。

**新增字段**（定义见 `contracts/milvus/kb_documents_collection.py`）：

| 字段 | 类型 | 优先级 | 检索用途 |
|------|------|--------|---------|
| `tags` | `VARCHAR(512)` | **MVP 现在加** | 继承展平标签（文档→章节→分片，最多 9 个），逗号分隔，建 INVERTED 索引 |
| `chunk_type` | `VARCHAR(32)` | **MVP 现在加** | 段落类型：`definition` / `procedure` / `rule` / `example` / `disclaimer` |
| `keywords` | `VARCHAR(256)` | 二期 (PHASE2) | 关键词（空格分隔），支持 BM25 混合检索 |
| `summary` | `VARCHAR(256)` | 三期 (PHASE3) | LLM 单句摘要，rerank 时 query vs summary 比 query vs 原文更准 |

**标签继承展平**（写时解析）：
```
文档标签:  ["合规", "金融", "2026"]
  └─ 章节标签: ["反洗钱", "KYC"]
       └─ 分片标签: ["大额交易", "报告义务"]
            → 最终存入 tags: "合规,金融,2026,反洗钱,KYC,大额交易,报告义务"
```

**`chunk_type` 语义区分**（补偿向量盲区）：
- `definition` — 概念定义，适合回答「什么是」
- `procedure` — 操作步骤，适合回答「怎么做」
- `rule` — 规定/条款，适合回答「什么规定」
- `example` — 案例/示例
- `disclaimer` — 免责声明，低信息量，rerank 降权

**涉及改动范围**：
- `contracts/milvus/kb_documents_collection.py` — Schema 定义（已更新）
- `kb-doc-processor/src/pipeline.py` — 入库时写入 tags + chunk_type
- `vector-service` — Milvus upsert 传递新字段
- `rag-service` — 检索时支持 tags filter + chunk_type 优先级

---

## Sprint 4 — 检索链路（链路A）

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| rag-service query 改写（同义词扩展） | ✅ 已完成 | 2026-05-02 | 中文同义词词典 + 指代消解（规则） |
| rag-service 关键词兜底 | ✅ 已完成 | 2026-05-02 | 正则匹配条款编号/章节 |
| rag-service Milvus 向量检索 Top20 + ACL 预过滤 | ✅ 已完成 | 2026-05-02 | 含全部 ACL filter 字段 |
| rerank-service BGE-Reranker | ✅ 已完成 | 2026-05-02 | Python FastAPI, BAAI/bge-reranker-v2-m3 |
| rag-service ACL 二次校验 | ✅ 已完成 | 2026-05-02 | 查 doc_acl 表 + knowledge_version |
| rag-service 拒答逻辑 | ✅ 已完成 | 2026-05-02 | NO_MATCH/NO_PERMISSION/LOW_CONFIDENCE |
| rag-service Prompt 构造 + citations | ✅ 已完成 | 2026-05-02 | 含会话历史 + 引用标注 |
| llm-gateway 路由与审计 | ✅ 已完成 | 2026-05-02 | MiniMax abab6.5s-chat, 结构化审计日志 |
| 检索结果 Redis 缓存 | ✅ 已完成 | 2026-05-02 | key 含 perm_group_ids |
| rag-service 多轮会话管理 | ✅ 已完成 | 2026-05-02 | Redis session, TTL 30min, 最多 10 轮 |
| kb-portal RAG 对话 UI | ✅ 已完成 | 2026-04-30 | 对话气泡 + citations 展开 + 真实 API 对接 |

---

## Sprint 5 — 前端门户

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| kb-portal 项目脚手架 | ✅ 已完成 | 2026-04-29 | Next.js + Ant Design + TypeScript |
| kb-portal AppLayout（侧边栏导航） | ✅ 已完成 | 2026-04-29 | 可折叠侧边栏，知识库/空间/文档/问答/设置 |
| kb-portal 主题系统（ThemeProvider） | ✅ 已完成 | 2026-04-29 | 浅色/深色/随系统，CSS 变量驱动 |
| kb-portal 登录页面 | ✅ 已完成 | 2026-04-29 | 账号 admin / 密码 admin123 |
| kb-portal 路由权限控制 | ✅ 已完成 | 2026-04-29 | middleware 保护未登录访问 |
| kb-portal 文档上传流程 | ✅ 已完成 | 2026-04-28 | init-upload→后端代理上传→verify→commit→ingest |
| kb-portal 元数据填写界面 | ✅ 已完成 | 2026-04-28 | docType/bizDomain/regionCode/secLevel/labelTags |
| kb-portal 上传页空间选择器 | ✅ 已完成 | 2026-04-28 | 知识空间选择 + 切片配置 UI |
| kb-portal 状态轮询展示 | ✅ 已完成 | 2026-04-28 | 流水线动画 + 子步骤详情 |
| kb-portal 文档列表页 | ✅ 已完成 | 2026-04-30 | 按空间 Tab 筛选 + URL ?spaceId=xxx 参数 |
| kb-portal 文档详情页 | ✅ 已完成 | 2026-04-30 | /documents/[id]，元数据 + 标签 + 文件预览 |
| kb-portal 文档删除 | ✅ 已完成 | 2026-04-30 | 列表批量/单项删除 + 详情页删除 |
| kb-portal 文件预览组件 | ✅ 已完成 | 2026-04-30 | pdf/图片在线预览 + 其他格式下载 |
| kb-portal 知识空间管理页 | ✅ 已完成 | 2026-04-28 | /spaces 列表、创建、详情/编辑、删除 |
| kb-portal 知识问答界面 | ✅ 已完成 | 2026-04-30 | 对话 UI + citations 引用 + mock 数据 |
| kb-portal 设置页面 | ✅ 已完成 | 2026-04-30 | /settings，主题/连接/系统信息 |
| kb-portal Space API 对接 | ✅ 已完成 | 2026-04-28 | 前端 Spaces 页面对接真实 API |
| kb-portal Docs API 对接 | ✅ 已完成 | 2026-04-30 | 文档列表/详情/删除对接真实 API |
| kb-portal 分片可视化组件 | ✅ 已完成 | 2026-05-02 | ChunkVisualizer：原文标注+分片列表双视图，交互式导航 |
| kb-portal 文档详情页「查看分片」 | ✅ 已完成 | 2026-05-02 | READY 状态可查看，对接 kb-doc-processor 分片 API |
| kb-portal RAG API 对接 | ✅ 已完成 | 2026-05-02 | 替换 mock，对接 /rag/v1/chat，含拒答处理 |

---

## 二期功能（暂缓，PHASE2 占位）

| 功能 | 状态 | 备注 |
|-----|------|------|
| OCRParser（扫描件解析） | ⏸ 暂缓（二期） | 依赖 Tesseract+EasyOCR |
| PIIFilter（PII 脱敏） | ⏸ 暂缓（二期） | 需完成数据合规评审 |
| BM25 混合检索 | ⏸ 暂缓（二期） | 依赖 Elasticsearch 8.x |
| search-service（独立搜索服务） | ⏸ 暂缓（二期） | - |
| OPA 策略引擎（ABAC） | ⏸ 暂缓（二期） | - |
| 多模型路由（embedding） | ⏸ 暂缓（二期） | - |
| 数据归档（knowledge_doc_archive） | ⏸ 暂缓（二期） | FAILED>30天/OFFBOARDED>90天 |

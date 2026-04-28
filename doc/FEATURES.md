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

## Sprint 1 — 认证基础

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| kb-infra Docker Compose 基础设施 | 📋 计划中 | - | PG/Redis/MinIO/Kafka/Milvus |
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
| ingest-service init-upload 接口 | 📋 计划中 | - | MinIO presigned URL |
| ingest-service verify-upload 接口 | 📋 计划中 | - | sha256 校验 |
| ingest-service commit 接口 | 📋 计划中 | - | 写 knowledge_doc + doc_acl |
| ingest-service ingest 接口 | 📋 计划中 | - | 发布 file-ingest Kafka 消息 |
| ingest-service status 查询接口 | 📋 计划中 | - | 前端轮询 |
| kb-doc-processor Kafka Consumer | 📋 计划中 | - | 消费 file-ingest topic |
| kb-doc-processor TikaParser | 📋 计划中 | - | PDF/Word/PPT/Excel 解析 |
| kb-doc-processor TextCleaner | 📋 计划中 | - | 编码/特殊字符/HTML/页眉页脚 |
| kb-doc-processor FixedLengthChunker | 📋 计划中 | - | chunk_size=512, overlap=51 |
| kb-doc-processor 发布 embed-task 消息 | 📋 计划中 | - | 符合 kafka-schemas 定义 |

### 知识空间（Knowledge Space）

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| knowledge_space 表 | ✅ 已完成 | 2026-04-28 | 见 init-db/updates/007_knowledge_space_tables.sql |
| knowledge_doc.knowledge_space_id 列 | ✅ 已完成 | 2026-04-28 | 默认 DEFAULT |
| Space CRUD API | ✅ 已完成 | 2026-04-28 | /kb/v1/spaces（list/get/create/update/delete） |
| init-upload 支持 knowledgeSpaceId + chunkConfig | 📋 计划中 | - | 见 contracts/openapi |
| file-ingest-message.json 扩展 | ✅ 已完成 | 2026-04-28 | 新增 knowledgeSpaceId + chunkConfig |

---

## Sprint 3 — 向量化链路（链路B后半段）

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| embedding-service BGE 向量化接口 | 📋 计划中 | - | BGE-zh-v1.5，dim=1024 |
| vector-service embed-task Kafka 消费 | 📋 计划中 | - | 批量处理 batch_size=32 |
| vector-service Milvus upsert | 📋 计划中 | - | 含 ACL 预过滤字段 |
| vector-service 更新 knowledge_version 状态 | 📋 计划中 | - | PROCESSING→READY/FAILED |
| vector-service 版本软下线（OFFBOARDED） | 📋 计划中 | - | 5分钟后异步删除旧向量 |
| vector-service 熔断降级 | 📋 计划中 | - | Embedding 5xx>1% 熔断 |

---

## Sprint 4 — 检索链路（链路A）

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| rag-service query 改写（同义词扩展） | 📋 计划中 | - | - |
| rag-service 关键词兜底 | 📋 计划中 | - | 精确匹配条款编号/制度名称 |
| rag-service Milvus 向量检索 Top20 + ACL 预过滤 | 📋 计划中 | - | 必须含全部 ACL filter 字段 |
| rerank-service BGE-Reranker | 📋 计划中 | - | Top20→Top5 精排 |
| rag-service ACL 二次校验 | 📋 计划中 | - | 查 doc_acl 表 |
| rag-service 拒答逻辑 | 📋 计划中 | - | NO_MATCH/NO_PERMISSION/LOW_CONFIDENCE |
| rag-service Prompt 构造 + citations | 📋 计划中 | - | 返回带引用的答案 |
| llm-gateway 路由与审计 | 📋 计划中 | - | - |
| 检索结果 Redis 缓存 | 📋 计划中 | - | key 必须含 perm_group_ids |

---

## Sprint 5 — 前端门户

| 功能 | 状态 | 完成时间 | 备注 |
|-----|------|---------|------|
| kb-portal 文档上传流程 | 📋 计划中 | - | init-upload→直传→verify→commit→ingest |
| kb-portal 元数据填写界面 | 📋 计划中 | - | docType/bizDomain/regionCode/secLevel/ACL |
| kb-portal 状态轮询展示 | 📋 计划中 | - | 2s→5s→30s，超时10分钟 |
| kb-portal 知识问答界面 | 📋 计划中 | - | 展示 answer + citations |
| kb-portal 知识空间管理页 | ✅ 已完成 | 2026-04-28 | /spaces 列表、/spaces/create、/spaces/[id] |
| kb-portal 上传页空间选择器 | ✅ 已完成 | 2026-04-28 | 知识空间选择 + 切片配置 UI |
| kb-portal 文档列表 Tab 切换 | ✅ 已完成 | 2026-04-28 | 按知识空间分组展示 |
| kb-portal Space API 对接 | ✅ 已完成 | 2026-04-28 | 前端 Spaces 页面对接真实 API |

---

## 二期功能（暂缓，PHASE2 占位）

| 功能 | 状态 | 备注 |
|-----|------|------|
| OCRParser（扫描件解析） | ⏸ 暂缓（二期） | 依赖 Tesseract+EasyOCR |
| SemanticChunker（语义切片） | ⏸ 暂缓（二期） | 一期用 FixedLengthChunker，支持 HEAD_FIRST/TAIL_FIRST/UNIFORM 模式 |
| PIIFilter（PII 脱敏） | ⏸ 暂缓（二期） | 需完成数据合规评审 |
| BM25 混合检索 | ⏸ 暂缓（二期） | 依赖 Elasticsearch 8.x |
| search-service（独立搜索服务） | ⏸ 暂缓（二期） | - |
| OPA 策略引擎（ABAC） | ⏸ 暂缓（二期） | - |
| 多模型路由（embedding） | ⏸ 暂缓（二期） | - |
| 数据归档（knowledge_doc_archive） | ⏸ 暂缓（二期） | FAILED>30天/OFFBOARDED>90天 |

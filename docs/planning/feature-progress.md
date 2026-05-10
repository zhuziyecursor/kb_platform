# 功能进度总览

> 同步日期：2026-05-09  
> 依据：当前仓库代码、数据库迁移脚本、接口定义与已有架构/优化文档。  
> 状态含义：`已完成` 表示已有端到端代码路径；`部分完成` 表示主路径可用但仍有明确缺口；`未完成` 表示仅有方案、占位或尚未接入主链路。

## 总体状态

| 模块 | 当前状态 | 说明 |
|------|----------|------|
| 本地基础设施 | 已完成 | Docker Compose 提供 PostgreSQL、Redis、MinIO、Milvus、Kafka；应用服务在宿主机运行时通过 Docker 暴露端口连接。 |
| 文档上传与入库 | 已完成 | 支持 init-upload、文件上传/校验、commit、发布 `file-ingest`、状态查询、列表、下载、删除、失败重试。 |
| 文档解析与切片 | 部分完成 | Tika 解析、清洗、固定切片、规则语义切片、Parent-Child、LLM 边界精修 fallback 已实现；OCR/PII/精细页码锚点未完成。 |
| 向量入库 | 部分完成 | `embed-task` 批量消费、Milvus upsert、`embed_task`/文档状态更新已实现；向量删除、DLQ、稳定主键与幂等增强未完成。 |
| 知识空间 | 已完成 | 支持树形空间、创建/编辑/删除、文档数统计、智能解析开关、按空间过滤文档。 |
| 空间权限 | 部分完成 | 空间 ACL 配置与级联写入文档 ACL 已实现；真实用户/角色/部门来自 JWT 的权限上下文未接入。 |
| RAG 问答 | 部分完成 | Dense 检索、Rerank、引用、拒答、会话、流式输出、Trace、Prompt 预算控制已实现；BM25/RRF、FAQ 短路、意图路由、LLM 查询改写未完成。 |
| LLM Gateway | 部分完成 | MiniMax 阻塞/流式代理与基础审计日志已实现；多模型路由、限流、审计入库、流式 token 统计未完成。 |
| 前端门户 | 部分完成 | 首页、文档、空间、RAG、设置、权限、扩展、帮助等页面已具备；真实登录鉴权、细粒度权限、部分管理功能仍是前端态或开发态。 |
| 认证与网关 | 未完成 | 当前多处使用硬编码 `tenantId/userId`；OIDC/OBO、gateway 鉴权、JWT claims 解析仍处于 Phase 2。 |

## 已完成能力

### 基础设施与启动

| 功能 | 状态 | 位置 |
|------|------|------|
| Docker PostgreSQL/Redis/MinIO/Milvus/Kafka | 已完成 | `kb-infra/docker-compose/docker-compose.yml` |
| 初始化 schema 与更新脚本 | 已完成 | `kb-infra/init-db/` |
| 一键启动应用服务 | 已完成 | `start-all.sh` |
| Docker PostgreSQL 连接约束 | 已完成 | `start-all.sh` 强制注入 `DB_URL=jdbc:postgresql://localhost:25432/kb_knowledge` |

### 文档入库链路

| 功能 | 状态 | 位置 |
|------|------|------|
| 初始化上传与生成 MinIO presigned URL | 已完成 | `DocController.initUpload` / `DocServiceImpl.initUpload` |
| 后端代理上传文件 | 已完成 | `DocController.uploadFile` / `DocServiceImpl.uploadFile` |
| 文件大小与 SHA256 校验 | 已完成 | `DocController.verifyUpload` |
| commit 写入 ACL 与版本记录 | 已完成 | `DocServiceImpl.commit` |
| 发布 `file-ingest` Kafka 消息 | 已完成 | `DocServiceImpl.ingest` |
| 文档状态查询、列表、下载、删除、重试 | 已完成 | `DocController` |
| 文档列表按空间过滤 | 已完成 | `DocServiceImpl.listDocs` |
| 上传页流水线进度展示 | 已完成 | `kb-portal/web/src/app/documents/upload/page.tsx` |
| 文档列表状态展示与重试入口 | 已完成 | `kb-portal/web/src/app/documents/list/page.tsx` |

### 文档处理与向量化

| 功能 | 状态 | 位置 |
|------|------|------|
| Kafka `file-ingest` 消费 | 已完成 | `kb-doc-processor/src/kafka_consumer.py` |
| Tika 文本解析 | 已完成 | `kb-doc-processor/src/parser/tika_parser.py` |
| 文本清洗 | 已完成 | `kb-doc-processor/src/cleaner/text_cleaner.py` |
| 固定长度切片 | 已完成 | `kb-doc-processor/src/chunker/fixed_length_chunker.py` |
| 规则语义切片 | 已完成 | `kb-doc-processor/src/chunker/semantic_chunker.py` |
| Parent-Child 双层切片 | 已完成 | `semantic_chunker.py`、`014_parent_child_schema.sql` |
| LLM 边界精修切片 fallback | 已完成 | `kb-doc-processor/src/chunker/llm_chunker.py` |
| 批量调用 embedding 服务 | 已完成 | `kb-doc-processor/src/pipeline.py` |
| 写入 clean/structured/embed_task | 已完成 | `Pipeline._save_results` |
| 发布 `embed-task` Kafka 消息 | 已完成 | `Pipeline._publish_embed_tasks` |
| `embed-task` 批量消费与 Milvus upsert | 已完成 | `EmbedTaskConsumer` / `MilvusService` |
| 文档 READY 状态回写 | 已完成 | `EmbedTaskConsumer.updateVersionStatusIfAllDone` |

### 知识空间与管理

| 功能 | 状态 | 位置 |
|------|------|------|
| 空间树形结构 | 已完成 | `SpaceServiceImpl.getSpaceTree`、`008_space_hierarchy.sql` |
| 空间创建/编辑/删除 | 已完成 | `SpaceController` / `SpaceServiceImpl` |
| 防止删除非空子树 | 已完成 | `SpaceServiceImpl.deleteSpace` |
| 空间智能解析开关 | 已完成 | `011_add_smart_parse_enabled.sql`、空间 DTO/页面 |
| Markdown 大纲导入空间 | 已完成 | `kb-portal/web/src/app/spaces/import/page.tsx` |
| 空间 ACL 页面与后端接口 | 已完成 | `SpaceAclController`、`settings/permissions/page.tsx` |
| 首页统计概览接口 | 部分完成 | `StatsController` / `StatsServiceImpl` |

### RAG 问答

| 功能 | 状态 | 位置 |
|------|------|------|
| 阻塞问答接口 | 已完成 | `rag-service ChatController.POST /rag/v1/chat` |
| SSE 流式问答接口 | 已完成 | `POST /rag/v1/chat/stream` |
| 会话创建、列表、消息、删除 | 已完成 | `SessionService` / `ChatController` |
| 查询同义词扩展与简单指代消解 | 已完成 | `QueryRewritingService` |
| 条款关键词兜底增强 | 已完成 | `KeywordFallbackService` |
| Embedding 查询向量化 | 已完成 | `EmbeddingServiceClient` |
| Milvus dense 检索 | 已完成 | `MilvusSearchService` |
| ACL 客户端过滤与 DB 二次校验 | 已完成 | `MilvusSearchService.filterByAcl` / `AclVerificationService` |
| 知识空间范围过滤 | 已完成 | `ChatServiceImpl.resolveScopeDocIds` |
| Rerank 与不可用 fallback | 已完成 | `RerankServiceClient` / `ChatServiceImpl` |
| Parent 完整上下文回捞 | 已完成 | `ParentLookupService` |
| 低置信度/无结果拒答 | 已完成 | `RefusalService` |
| Prompt Token 预算控制 | 已完成 | `PromptBudgetPlanner` / `PromptConstructionService` |
| Pipeline Trace 持久化与前端展示 | 已完成 | `PipelineTraceService` / RAG 页面 Trace 抽屉 |

### 前端体验

| 功能 | 状态 | 位置 |
|------|------|------|
| 首页工作台与统计卡片 | 已完成 | `kb-portal/web/src/app/page.tsx` |
| 文档上传流程 | 已完成 | `documents/upload/page.tsx` |
| 文档列表与详情/分片可视化入口 | 已完成 | `documents/list`、`documents/[id]` |
| RAG 聊天、会话面板、引用展示 | 已完成 | `rag/page.tsx`、`RagSessionPanel` |
| RAG 快速智能入库 | 已完成 | `rag/page.tsx` |
| Pipeline Trace 抽屉 | 已完成 | `rag/page.tsx` |
| 空间列表、详情、创建、导入 | 已完成 | `spaces/*` |
| 扩展管理页面 | 部分完成 | `extensions/page.tsx`，主要使用前端本地存储 |
| 设置与 Pipeline 配置页 | 部分完成 | `settings/*`，部分为前端配置展示 |
| 帮助与反馈入口 | 已完成 | `help/page.tsx`、`HelpFeedbackModal` |

## 部分完成能力与缺口

| 功能域 | 已有能力 | 主要缺口 |
|--------|----------|----------|
| 文档状态可见性 | 文档状态可查、列表/上传页可展示、失败可重试 | doc-processor 内部未细分落库 `PARSING/CHUNKING/EMBEDDING`；错误原因与处理阶段未完整持久化。 |
| 智能分片 | `SMART` 规则语义切片、`SMART_LLM` LLM 边界精修 fallback、Parent-Child 已接入 | LLM 精修只生成 Parent，Child 提取与质量评估还需统一；页码/bbox/表格结构不完整。 |
| tags + chunk_type | 入库时写 tags/chunk_type，Milvus schema 已扩展 | 检索侧动态 boost 与按标签过滤未完整接入；章节/分片级标签仍是 Phase 2。 |
| ACL | doc_acl、space_acl、Milvus 字段、客户端过滤、DB verify 已有 | 用户权限组仍硬编码；Milvus ACL 下推未完成；租户/用户上下文未来自 OBO JWT。 |
| RAG 可观测性 | trace 表、阶段耗时、命中文档、首 token、Prompt 预算已实现 | 缺统一 trace 查询列表/聚合分析；LLM gateway 审计未入库；调用成本统计不完整。 |
| 统计看板 | 各空间文档数、7 天趋势、待处理/失败数量 | Milvus 向量总数为 placeholder；缺更多健康指标与告警。 |
| LLM Gateway | MiniMax 阻塞/流式代理、基础日志审计 | 多模型路由、限流、审计表落库、流式 prompt/completion token 统计未完成。 |
| 前端扩展管理 | Prompts/Skills/MCP 配置页面、本地导入导出 | 后端持久化、权限控制、运行时注入与审计未完成。 |

## 未完成 / Phase 2 功能

| 功能 | 当前状态 | 说明 |
|------|----------|------|
| OIDC 登录、OBO Token Exchange、Gateway 鉴权 | 未完成 | 当前前后端多处使用开发态固定 `tenantId/userId`。 |
| JWT claims 驱动权限上下文 | 未完成 | `DEV_TENANT_ID`、`DEV_USER_ID`、`DEV_PERM_GROUP_IDS` 仍为硬编码。 |
| OCR 解析 | 未完成 | `OCRParser` 为 Phase 2 placeholder。 |
| PII 脱敏 | 未完成 | `PIIFilter` 为 Phase 2 placeholder。 |
| 覆盖已有文档/版本化覆盖 | 未完成 | `overwriteExisting` 触发 Phase 2 placeholder。 |
| 文档软下线与 Milvus 向量删除 | 未完成 | 当前删除主要删 DB 与 MinIO，未形成向量一致删除链路。 |
| BM25 / 混合检索 / RRF 融合 | 未完成 | 目前以 dense 检索为主，关键词仅用于 query 增强。 |
| FAQ 短路 | 未完成 | 方案在 RAG 对比报告中，代码未接入。 |
| LLM-based 查询改写 | 未完成 | 当前为同义词表 + 简单指代消解。 |
| 意图路由与工具调用 | 未完成 | 工具类查询/闲聊仍未路由绕过 RAG。 |
| Milvus ACL 过滤完全下推 | 未完成 | 当前仍有客户端 ACL 过滤与 DB 二次校验。 |
| 多模型路由与模型策略 | 未完成 | llm-gateway 当前主要对接 MiniMax。 |
| 生产级认证、审计、限流、成本统计 | 未完成 | 多处仅日志或开发态实现。 |

## 近期建议优先级

| 优先级 | 建议事项 | 原因 |
|--------|----------|------|
| P0 | 接入真实 JWT/OBO 用户上下文 | 当前权限、租户隔离、审计可信度都依赖它。 |
| P0 | 完善文档处理阶段状态与错误持久化 | 上传后可观测性已经有 UI，需要后端状态更细。 |
| P1 | Milvus ACL 下推与性能验证 | 当前客户端过滤影响召回稳定性与性能。 |
| P1 | RAG 混合检索：BM25 + Dense + RRF | 解决条款定位、关键词查询和语义查询的平衡问题。 |
| P1 | LLM-based 查询改写与意图路由 | 降低工具类/闲聊查询误走 RAG 的成本与幻觉风险。 |
| P2 | 文档软删除/下线与向量一致性 | 删除和下线必须同步 Milvus，否则会出现陈旧召回。 |
| P2 | 统计看板补齐 Milvus 指标 | 让首页健康状态从 DB 视角扩展到向量库视角。 |

## 验证记录

| 日期 | 验证项 | 结果 |
|------|--------|------|
| 2026-05-09 | `kb-mcp/rag-service` 执行 `mvn test` | 通过，7 tests，0 failures。 |
| 2026-05-09 | `kb-portal/web` 执行 `npm run build` | 通过，Next.js 编译与 TypeScript 检查通过。 |


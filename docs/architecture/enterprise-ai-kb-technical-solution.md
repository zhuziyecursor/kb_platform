# 企业 AI 知识库平台技术方案

> 文档版本：V3.0  
> 编写日期：2026-05-09  
> 适用对象：技术负责人、架构评审专家、业务领导、项目管理与交付团队  
> 依据材料：当前 KB-Platform 工程实现、功能进度总览、桌面版《企业AI知识库MVP实施手册.md》、桌面版《汇报PPT.md》、RAG 核心流程对比报告。

---

## 1. 方案目标

企业内部知识库不是一个简单的“文件上传 + 向量检索 + 大模型回答”系统。它要解决的是企业知识沉淀、权限隔离、持续更新、可信问答、质量评测、运营闭环等一组工程问题。

当前项目已经完成第一阶段的骨架能力：文档上传、解析清洗、切片、向量入库、RAG 问答、引用展示、会话、SSE 流式输出、Pipeline Trace、Prompt Token 预算控制、知识空间管理等。但面向企业审计行业的长期落地，还需要继续补齐多路召回、权限打通、评测体系、反馈闭环、多模态解析和生产级治理。

本方案的目标是：

1. 明确当前工程已经具备的能力和不足，避免重复建设。
2. 给出可落地的三阶段技术路线，而不是停留在概念设计。
3. 针对当前痛点给出具体工程解法，包括数据模型、服务边界、接口、评测指标和验收标准。
4. 支撑后续专家和领导评审，能够回答“为什么这样做、怎么落地、如何验收、风险在哪里”。

---

## 2. 核心问题与痛点

### 2.1 企业知识建设痛点

| 痛点 | 现象 | 工程影响 |
|------|------|----------|
| 多格式文档解析不可控 | PDF、Word、Excel、PPT、扫描件、图表、跨页表格质量差异大 | 入库质量不稳定，检索效果上限受限 |
| 缺少解析过程可视化 | 用户上传后不知道是否解析完成、失败原因是什么 | 运维和业务用户都难排查 |
| 切片策略粗糙 | 切片过大导致上下文噪声高，切片过小导致语义断裂 | 召回不准、回答不完整、Token 成本高 |
| 元数据抽取不足 | 文档类型、业务域、地区、密级、生效期、标签等利用不足 | 权限过滤、范围检索、时效判断都难做 |
| 更新和下线机制不完整 | 旧版本向量未删除或未软下线 | 召回过期制度，答案不可信 |

### 2.2 智能问答痛点

| 痛点 | 当前影响 | 后续解决方向 |
|------|----------|--------------|
| 单路 Dense 检索能力不足 | 对“第几条”“编号”“专有名词”“精确数值”不敏感 | 第二阶段引入 BM25、FAQ、精确条款 Fast Path 和 RRF 融合 |
| 查询理解较弱 | 同义词靠硬编码，复杂追问/指代消解覆盖不足 | 第二阶段接入 LLM-based Query Rewrite 与租户术语表 |
| 所有问题都走 RAG | 闲聊、通讯录、日历、结构化查询容易幻觉且成本高 | 第二阶段增加意图路由和工具调用 |
| 幻觉控制仍需加强 | 检索结果弱相关时模型可能编造 | 增强拒答、引用校验、答案忠实度评测 |
| 评测体系缺失 | 迭代后不知道召回和回答是否真的提升 | 第三阶段建立检索、生成、权限、性能、用户反馈评测体系 |

### 2.3 企业级治理痛点

| 痛点 | 当前状态 | 后续目标 |
|------|----------|----------|
| 权限上下文未打通 | 多处使用开发态固定 tenant/user/perm_group | 第三阶段接入 OIDC/OBO/JWT claims 和用户权限上下文 |
| 审计和成本统计不完整 | LLM 调用主要是日志，Token 统计不完整 | 建立 LLM 调用审计表、成本仪表盘、调用追踪 |
| Badcase 无闭环 | 前端已有点赞/收藏等雏形，未进入评测和训练闭环 | 反馈入库，形成评测集和优化任务 |
| 生产部署治理不足 | 本地 Docker 环境可运行，缺生产级容量规划和告警 | 第三阶段补齐监控、限流、重试、DLQ、SLO |

---

## 3. 当前工程现状

### 3.1 当前仓库结构

```text
kb-platform/
├── kb-portal/web                 # Next.js 前端门户
├── kb-mcp/
│   ├── ingest-service             # Java，文档入库、空间、ACL、统计
│   ├── vector-service             # Java，消费 embed-task，写 Milvus
│   ├── rag-service                # Java，检索、问答、会话、Trace
│   ├── llm-gateway                # Java，MiniMax 代理、流式输出、审计日志
│   ├── kb-gateway                 # 规划中的统一网关
│   ├── auth-adapter               # 规划中的认证适配器
│   └── user-service               # 规划中的用户上下文服务
├── kb-doc-processor               # Python，解析、清洗、切片、embedding 批处理
├── kb-infra                       # Docker Compose 与数据库初始化
├── contracts                      # OpenAPI、Kafka Schema、Milvus Collection 契约
└── docs                           # 架构、功能、规划文档
```

### 3.2 第一阶段已具备能力

| 能力 | 当前实现 |
|------|----------|
| 文档上传 | init-upload、MinIO presigned URL、后端代理上传、校验、commit |
| 入库流水线 | Kafka `file-ingest` → doc-processor → Kafka `embed-task` → vector-service → Milvus |
| 文档状态 | DRAFT/PENDING/PROCESSING/READY/FAILED 等基础状态 |
| 知识空间 | 树形空间、空间创建/编辑/删除、Markdown 大纲导入、智能解析开关 |
| 文档解析 | Tika 解析、文本清洗、固定切片、规则语义切片、LLM 精修 fallback |
| Parent-Child | 子 chunk 检索，Parent 文本回捞用于生成上下文 |
| 向量入库 | embedding 批处理、Milvus upsert、状态回写 |
| RAG 问答 | Dense 检索、Rerank、ACL 客户端过滤、DB 二次校验、拒答 |
| 用户体验 | RAG 聊天、SSE 流式输出、会话历史、引用来源、Trace 抽屉 |
| Prompt 控制 | Token 预算、历史压缩、引用压缩、Prompt 预算可观测 |
| 可观测性 | Pipeline Trace、阶段耗时、命中文档、首 Token、Prompt Budget |

#### 3.2.1 当前阶段功能细化清单

第一阶段不是只有“上传 + 问答”两个功能，而是已经具备了一条可运行的知识库闭环。下面按业务域展开当前已经完成或基本完成的功能，便于评审时对齐现状。

##### A. 基础设施与工程启动

| 功能点 | 当前完成情况 | 关键位置 |
|--------|--------------|----------|
| Docker 基础设施 | PostgreSQL、Redis、MinIO、Milvus、Kafka 均通过 Docker Compose 提供 | `kb-infra/docker-compose/docker-compose.yml` |
| 数据库初始化 | 已有 schema、业务表、更新脚本、服务用户授权脚本 | `kb-infra/init-db/` |
| 应用服务启动 | 提供一键启动脚本，启动 ingest、vector、doc-processor、rerank、llm-gateway、rag、portal | `start-all.sh` |
| Docker 数据库连接约束 | 应用服务运行在宿主机时，统一连接 Docker PostgreSQL 映射端口 `localhost:25432` | `start-all.sh` |
| 服务契约 | 已维护 OpenAPI、Kafka Schema、Milvus Collection 字段定义 | `contracts/` |

##### B. 文档生命周期管理

| 功能点 | 当前完成情况 | 关键位置 |
|--------|--------------|----------|
| 初始化上传 | 前端提交文件名、大小、hash、业务元数据，后端生成 `docId` 和 MinIO 路径 | `DocController.initUpload`、`DocServiceImpl.initUpload` |
| 文件上传 | 支持 MinIO presigned URL 直传，也支持后端代理上传 | `MinioService`、`DocController.uploadFile` |
| 文件校验 | 校验对象是否存在、大小和 SHA256 是否一致 | `DocServiceImpl.verifyUpload` |
| 元数据登记 | 写入 `knowledge_doc`，包括 title、doc_type、biz_domain、region_code、sec_level、owner、dept、space、chunk 配置、标签 | `KnowledgeDoc`、`DocServiceImpl` |
| 版本记录 | commit 时创建 `knowledge_version`，初始状态 `PENDING` | `DocServiceImpl.commit` |
| 文档 ACL | commit 时写入 `doc_acl` | `DocAclRepository`、`DocServiceImpl.commit` |
| 触发入库 | `POST /kb/v1/docs/{docId}/ingest` 发布 `file-ingest` Kafka 消息 | `DocServiceImpl.ingest` |
| 文档列表 | 支持按租户、按空间筛选文档 | `DocServiceImpl.listDocs` |
| 状态查询 | 支持查询单文档状态，前端用于轮询 | `DocController.getStatus` |
| 下载/预览 | 可从 MinIO 读取原始文件返回前端 | `DocController.getDocFile` |
| 删除 | 当前删除 DB 记录并尝试删除 MinIO 对象 | `DocServiceImpl.deleteDoc` |
| 重试 | FAILED 文档可重置为 PENDING 后重新触发入库 | `DocServiceImpl.retryDoc` |

##### C. 知识空间与权限配置

| 功能点 | 当前完成情况 | 关键位置 |
|--------|--------------|----------|
| 树形空间 | 支持 parent_id、node_path、depth，多层级空间树 | `008_space_hierarchy.sql`、`SpaceServiceImpl.getSpaceTree` |
| 空间 CRUD | 支持创建、编辑、详情、删除 | `SpaceController`、`SpaceServiceImpl` |
| 非空保护 | 删除空间前校验自身及子树是否存在文档 | `SpaceServiceImpl.deleteSpace` |
| Markdown 大纲导入 | 前端解析 Markdown 标题并批量创建空间 | `kb-portal/web/src/app/spaces/import/page.tsx` |
| 空间智能解析开关 | 每个空间可配置是否启用智能解析 | `smart_parse_enabled`、空间创建/编辑页 |
| 空间 ACL | 支持配置 USER/ROLE/DEPT 对空间的 READ/WRITE/ADMIN 权限，并级联到文档 ACL | `SpaceAclController`、`SpaceAclServiceImpl` |
| RAG 空间过滤 | 问答时可选择空间，后端按空间子树过滤 docId | `ChatServiceImpl.resolveScopeDocIds` |

##### D. 文档解析、清洗与切片

| 功能点 | 当前完成情况 | 关键位置 |
|--------|--------------|----------|
| Kafka 消费 | `kb-doc-processor` 消费 `file-ingest` 消息 | `kafka_consumer.py` |
| 文件读取 | 根据 `srcPath` 从 MinIO 拉取文件 bytes | `MinioClient`、`Pipeline.process_message` |
| Tika 解析 | 支持文本型文档解析，输出 full_text、page_count、metadata | `TikaParser` |
| MVP 限制 | 单文件大小、页数、OCR 关闭等限制已在配置中体现 | `settings.yaml`、`TikaParser` |
| 文本清洗 | 去除异常字符、规整空白、计算质量分 | `TextCleaner` |
| 固定切片 | 支持 `HEAD_FIRST`、`TAIL_FIRST`、`UNIFORM` 等基础模式 | `FixedLengthChunker` |
| 规则语义切片 | 识别章节/条款标题，按语义段落形成 Parent | `SemanticChunker` |
| Parent-Child | Parent 保存完整语义上下文，Child 作为检索单元 | `SemanticChunker`、`parent_ref`、`is_parent` |
| LLM 精修 fallback | `SMART_LLM` 模式可调用 MiniMax 精修边界，失败回退规则切片 | `LLMChunker` |
| chunk_type 推断 | 根据定义、流程、规则、示例等关键词推断 chunk 类型 | `Pipeline._infer_chunk_type` |
| 标签透传 | 文档级 label_tags 写入 embed_task 和 Kafka 消息 | `Pipeline._save_results`、`_publish_embed_tasks` |
| 清洗/结构化结果入库 | 写入 `knowledge_clean` 和 `knowledge_structured` | `Pipeline._save_results` |
| embed_task 入库 | 每个 chunk 生成 `embed_task`，状态为 PENDING | `EmbedTask`、`Pipeline._save_results` |

##### E. 向量化与 Milvus 入库

| 功能点 | 当前完成情况 | 关键位置 |
|--------|--------------|----------|
| embedding 批处理 | doc-processor 将 chunks 按批次调用 embedding 服务 | `Pipeline._embed` |
| embed-task 发布 | 发布包含文本、向量、元数据、ACL 字段、parent_ref 的 Kafka 消息 | `EmbedTaskMessage` |
| batch 消费 | vector-service 批量消费 `embed-task` | `EmbedTaskConsumer` |
| Milvus upsert | 写入 id、doc_id、tenant_id、version、chunk_seq、vector、text、title、section_path、ACL、tags、chunk_type 等字段 | `MilvusService.upsert` |
| 状态回写 | 每个 chunk 完成后将 `embed_task` 标记 DONE | `EmbedTaskRepository.markDone` |
| 文档 READY | 当同一文档版本所有 embed_task 均 DONE，更新 `knowledge_version` 和 `knowledge_doc` 为 READY | `EmbedTaskConsumer.updateVersionStatusIfAllDone` |
| 失败标记 | Milvus upsert 失败时标记任务 FAILED | `EmbedTaskConsumer.markFailed` |

##### F. RAG 检索问答

| 功能点 | 当前完成情况 | 关键位置 |
|--------|--------------|----------|
| 阻塞问答 | `POST /rag/v1/chat` 返回完整答案 | `rag-service ChatController` |
| 流式问答 | `POST /rag/v1/chat/stream` 使用 SSE 输出 token | `ChatController.chatStream` |
| 会话管理 | 支持创建、列表、消息查询、删除会话 | `SessionService`、`rag_session`、`rag_message` |
| 简单查询改写 | 同义词扩展 + 简单指代消解 | `QueryRewritingService` |
| 条款关键词增强 | 识别“第 X 条/章/节”等表达并增强 query | `KeywordFallbackService` |
| 查询向量化 | 调用 embedding 服务生成 query vector | `EmbeddingServiceClient` |
| Dense 检索 | 调 Milvus 根据向量召回 TopK | `MilvusSearchService.search` |
| ACL 过滤 | 基于 sec_level、perm_group_id 做客户端过滤 | `MilvusSearchService.filterByAcl` |
| Rerank | 调 rerank-service 精排，失败时按向量分 fallback | `RerankServiceClient`、`ChatServiceImpl` |
| DB 二次校验 | 根据 doc_acl/版本状态做最终校验 | `AclVerificationService` |
| Parent 回捞 | 根据 parent_ref 回捞 Parent 完整文本用于生成 | `ParentLookupService` |
| 拒答策略 | 无结果、低置信度触发拒答 | `RefusalService` |
| Prompt 构造 | system prompt + history + citations + query | `PromptConstructionService` |
| Token 预算 | 按 0.75 输入预算、保留高分引用、压缩历史和引用 | `PromptBudgetPlanner` |
| LLM Gateway | 统一调用 MiniMax，支持阻塞和流式 | `LlmGatewayClient`、`llm-gateway` |
| 引用返回 | answer 携带 citations，前端展示来源 | `CitationDto`、`rag/page.tsx` |
| 缓存 | 基于 tenant/query/perm_group 缓存重复问答 | `CacheService` |

##### G. 可观测性与前端体验

| 功能点 | 当前完成情况 | 关键位置 |
|--------|--------------|----------|
| RAG Pipeline Trace | 记录 session、query、rewrittenQuery、阶段耗时、召回数量、结果状态 | `PipelineTraceService`、`rag_pipeline_trace` |
| 首 Token 统计 | 流式输出时记录 firstTokenMs | `TraceContext.markFirstToken` |
| 命中文档摘要 | Trace 中保存最终 citations 文档摘要 | `TraceContext.setHitDocs` |
| Prompt Budget 统计 | Trace 保存 inputBudget、estimatedPromptTokens、引用/历史保留情况 | `prompt_budget` |
| 前端 Trace 抽屉 | RAG 页面可查看阶段耗时、命中文档、Prompt 预算 | `rag/page.tsx` |
| 文档上传进度 UI | 上传页展示入库流程步骤和子步骤 | `documents/upload/page.tsx` |
| 首页统计 | 首页展示文档/空间/会话等概览 | `app/page.tsx`、`StatsController` |
| 扩展管理 | Prompts、Skills、MCP 配置本地管理 | `extensions/page.tsx`、`useExtensions` |

### 3.3 第一阶段仍存在的缺口

1. 权限仍是开发态：前端和后端存在 `DEV_TENANT_ID`、`DEV_USER_ID`、`DEV_PERM_GROUP_IDS`。
2. 检索仍以 Dense 为主：没有 BM25、FAQ 短路、RRF 融合。
3. 查询改写仍偏规则：同义词表和简单正则无法覆盖复杂追问。
4. 文档处理状态不够细：上传页面有流程展示，但后端未完整持久化 PARSING/CHUNKING/EMBEDDING 子阶段。
5. OCR、表格、图表、多模态解析未完成。
6. 文档软下线和 Milvus 向量删除链路未闭环。
7. 评测体系、反馈闭环、成本治理尚未形成。

### 3.4 第一阶段安全门槛与 DEV 常量替换路径

虽然完整统一认证和 OBO 权限链路放在第三阶段实施，但第一阶段进入真实业务试点前必须设置安全门槛，避免开发态权限上下文进入真实敏感数据场景。

第一阶段试点边界：

| 场景 | 是否允许 | 条件 |
|------|----------|------|
| 演示数据、脱敏数据 | 允许 | 可继续使用开发态 mock 用户，但必须标识为非生产环境 |
| 单租户小范围试点 | 有条件允许 | 必须固定租户、固定白名单用户、启用空间 ACL、开启审计 |
| 多租户真实数据 | 不允许 | 必须等待 OBO/JWT 和 tenant 绑定完成 |
| 高密级、涉密、强合规文档 | 不允许 | 必须等待完整权限、审计、下线和删除闭环完成 |

DEV 常量替换建议采用“上下文抽象先行、认证实现后接入”的路径：

```text
当前 DEV_TENANT_ID / DEV_USER_ID / DEV_PERM_GROUP_IDS
  → 统一 RequestUserContext / SecurityContext 接口
  → 开发环境由 MockUserContextResolver 提供
  → 试点环境由网关 Header 或临时 Token 提供
  → 第三阶段切换为 OBO JWT Claims + user-service
```

改造原则：

1. 业务代码不再直接读取 `DEV_TENANT_ID`、`DEV_USER_ID`、`DEV_PERM_GROUP_IDS`。
2. ingest、rag、vector 等服务统一依赖 `CurrentUserContext`。
3. 开发环境可以 mock，但 mock 只能存在于 resolver 层。
4. 所有文档、空间、检索、审计写入必须显式带 `tenant_id` 和 `user_id`。
5. 接入 OBO 后只替换上下文解析实现，不改业务权限判断主逻辑。

---

## 4. 目标架构

### 4.1 总体架构

```text
用户/业务系统/智能体
        |
        | OIDC 登录 / OBO Token
        v
统一网关 kb-gateway
        |
        | JWT 校验、scope 校验、tenant 绑定、trace_id 注入
        v
业务服务层
  ├── ingest-service      文档入库、空间、ACL、状态机
  ├── kb-doc-processor    解析、清洗、切片、OCR/表格/多模态扩展
  ├── vector-service      embedding、Milvus upsert/delete、向量状态管理
  ├── rag-service         查询理解、多路召回、RRF、Rerank、Prompt、引用、拒答
  ├── llm-gateway         多模型路由、流式、审计、限流、成本统计
  ├── user-service        用户上下文、组织角色、权限组、密级
  └── eval-service        评测集、离线评测、在线反馈、质量报表
        |
        v
基础设施层
  PostgreSQL / Redis / Kafka / MinIO / Milvus / Elasticsearch 或 OpenSearch / Prometheus
```

### 4.2 两条核心链路

#### 链路 A：知识入库目标链路

```text
上传文件
  → 权限校验
  → init-upload
  → MinIO 存储
  → verify-upload
  → commit 元数据、ACL、版本
  → file-ingest Kafka
  → 解析 Parser
  → 清洗 Cleaner
  → 结构化抽取 Metadata Extractor
  → 切片 Chunker
  → embedding
  → embed-task Kafka
  → Milvus upsert
  → 状态 READY
  → 入库质量评估
```

#### 链路 B：智能问答目标链路

```text
用户问题
  → 权限上下文解析
  → 意图识别
  → 查询改写/拆解/关键词抽取
  → 多路召回
      ├── Dense 向量召回
      ├── BM25 关键词召回
      ├── FAQ 高置信短路
      ├── 条款编号精确匹配
      └── 元数据过滤召回
  → RRF 融合
  → Rerank 精排
  → ACL 二次校验
  → Parent 上下文回捞
  → Prompt 预算规划
  → LLM 生成
  → 引用校验/敏感过滤/格式化
  → SSE 输出
  → Trace、审计、反馈记录
```

### 4.3 当前实际已完成流程：文件上传到向量入库

当前工程已经打通从前端上传到 Milvus 向量入库的主链路。实际流程如下：

```text
1. 前端选择文件、空间、文档类型、密级、业务域、地区、标签、切片配置
   ↓
2. 前端调用 ingest-service: POST /kb/v1/docs/init-upload
   ↓
3. ingest-service 写 knowledge_doc(DRAFT)，生成 docId、srcPath、presignedUrl
   ↓
4. 前端上传文件
   ├── 方式 A：使用 presignedUrl 上传到 MinIO
   └── 方式 B：调用 POST /kb/v1/docs/{docId}/upload 由后端代理上传
   ↓
5. 前端调用 POST /kb/v1/docs/{docId}/verify-upload
   ↓
6. ingest-service 校验 MinIO 对象大小和 SHA256，标记 verified=true
   ↓
7. 前端调用 POST /kb/v1/docs/{docId}/commit
   ↓
8. ingest-service 写 doc_acl、knowledge_version(PENDING)，knowledge_doc 更新为 PENDING
   ↓
9. 前端调用 POST /kb/v1/docs/{docId}/ingest
   ↓
10. ingest-service 更新 knowledge_doc(PROCESSING)，发布 file-ingest Kafka 消息
   ↓
11. kb-doc-processor 消费 file-ingest
   ↓
12. 从 MinIO 读取原始文件
   ↓
13. TikaParser 解析文本和基础 metadata
   ↓
14. TextCleaner 清洗文本并计算 quality_score
   ↓
15. 按 chunkMode 选择切片器
      ├── HEAD_FIRST / TAIL_FIRST / UNIFORM → FixedLengthChunker
      ├── SMART → SemanticChunker
      └── SMART_LLM → LLMChunker，失败回退 SemanticChunker
   ↓
16. 生成 chunks
      ├── Parent chunk：完整语义单元
      └── Child chunk：检索单元，关联 parent_ref
   ↓
17. 批量调用 embedding 服务生成向量
   ↓
18. 写 PostgreSQL
      ├── knowledge_clean
      ├── knowledge_structured
      └── embed_task(PENDING)
   ↓
19. 发布 embed-task Kafka 消息
   ↓
20. vector-service 批量消费 embed-task
   ↓
21. MilvusService.upsert 写入向量和标量字段
      ├── tenant_id / doc_id / version / chunk_seq
      ├── vector / text / title / section_path / page
      ├── sec_level / perm_group_id / acl_version
      ├── region_code / biz_domain / effective_from / effective_to
      └── tags / chunk_type / keywords / summary
   ↓
22. vector-service 将 embed_task 标记 DONE
   ↓
23. 当同文档版本所有 embed_task 均 DONE
      ├── knowledge_version 更新 READY
      └── knowledge_doc 更新 READY
   ↓
24. 前端文档列表/上传页轮询状态，显示文档可检索
```

当前实际流程对应的核心文件：

| 步骤 | 关键实现 |
|------|----------|
| 上传入口 | `kb-mcp/ingest-service/.../DocController.java` |
| 入库状态和 Kafka 消息 | `DocServiceImpl.java` |
| MinIO 文件操作 | `MinioService.java` |
| 文档处理主流程 | `kb-doc-processor/src/pipeline.py` |
| Tika 解析 | `kb-doc-processor/src/parser/tika_parser.py` |
| 清洗 | `kb-doc-processor/src/cleaner/text_cleaner.py` |
| 切片 | `fixed_length_chunker.py`、`semantic_chunker.py`、`llm_chunker.py` |
| embedding 调用 | `kb-doc-processor/src/embedding_client.py` |
| embed-task 发布 | `kb-doc-processor/src/kafka_producer.py` |
| 向量消费 | `kb-mcp/vector-service/.../EmbedTaskConsumer.java` |
| Milvus 写入 | `kb-mcp/vector-service/.../MilvusService.java` |

当前已完成流程的关键特点：

1. **异步解耦**：上传接口不直接解析文件，而是通过 Kafka 将耗时任务异步化。
2. **状态可见**：文档拥有 DRAFT、PENDING、PROCESSING、READY、FAILED 基础状态。
3. **双层切片基础已具备**：Child 用于检索，Parent 用于回答上下文回捞。
4. **元数据已随向量入库**：tenant、doc、version、密级、权限组、地区、业务域、生效期、标签、chunk_type 已写入 Milvus。
5. **失败可重试**：文档 FAILED 后可通过 retry 接口重新入队。

当前流程仍需补强：

| 缺口 | 当前表现 | 目标补强 |
|------|----------|----------|
| 阶段状态粒度不足 | 后端主要是 PROCESSING/READY/FAILED | 增加 PARSING/CLEANING/CHUNKING/EMBEDDING/INDEXING |
| 错误原因不完整 | 状态失败后缺少结构化错误码和错误阶段 | 保存 `last_error_code/message/stage/trace_id` |
| OCR 未启用 | 扫描件、图片 PDF 解析能力不足 | 第三阶段接入 OCR 和多模态解析 |
| 表格/图表解析不足 | 表格结构被弱化为文本 | 引入表格抽取、caption、结构化表示 |
| 向量删除未闭环 | 删除文档未完整删除 Milvus 向量 | 增加 vector_delete_task 和一致性巡检 |
| 版本软下线未闭环 | 旧版本可能需要更强约束 | 新版本 READY 后旧版本 OFFBOARDED 或 is_current=false |

### 4.4 当前实际已完成流程：检索问答

当前 RAG 链路已经实现“用户提问 → 检索 → 精排 → 构造 Prompt → LLM 生成 → 引用和 Trace 返回”的主流程。

```text
1. 前端 RAG 页面输入问题，可选择知识空间和会话
   ↓
2. 前端调用 rag-service
   ├── 阻塞接口：POST /rag/v1/chat
   └── 流式接口：POST /rag/v1/chat/stream
   ↓
3. rag-service 创建 traceId，初始化 PipelineTrace
   ↓
4. cache_lookup
   ├── 命中 Redis 缓存 → 直接返回缓存答案
   └── 未命中 → 继续完整 RAG
   ↓
5. session_context
   ├── 读取历史会话
   └── 提取上一轮 query/answer 用于简单指代消解
   ↓
6. query_rewrite
   ├── QueryRewritingService 同义词扩展
   ├── 简单指代消解
   └── KeywordFallbackService 条款关键词增强
   ↓
7. embedding
   └── 调 embedding 服务生成 query vector
   ↓
8. milvus_search
   └── Milvus dense 向量召回，TopK 至少放大到 50
   ↓
9. acl_post_filter
   └── 基于 sec_level、perm_group_id 做客户端过滤
   ↓
10. space_filter
    └── 如果指定 spaceId，则查询空间子树 docIds 并过滤召回结果
   ↓
11. rerank
    ├── 调 rerank-service 重新排序
    └── rerank 不可用时按向量分 fallback
   ↓
12. acl_verify
    └── 查询 PostgreSQL doc_acl 和版本状态做二次校验
   ↓
13. parent_lookup
    └── 基于 parent_ref 回捞 Parent 完整文本
   ↓
14. refusal_check
    ├── 无结果 → NO_MATCH
    ├── 低置信度 → LOW_CONFIDENCE
    └── 有可信结果 → 继续生成
   ↓
15. prompt_build
    ├── 引用按分数排序
    ├── 计算 inputBudget
    ├── 保留最近会话历史
    ├── 超长引用首尾压缩
    └── 返回 LlmGatewayRequest
   ↓
16. llm_generate / llm_generate_stream
    └── 经 llm-gateway 调 MiniMax 生成答案
   ↓
17. session_save
    └── 保存用户问题、助手回答、citations、traceId
   ↓
18. cache_write
    └── 非流式成功结果写入 Redis 缓存
   ↓
19. 返回前端
    ├── answer
    ├── citations
    ├── traceId
    └── sessionId
   ↓
20. 前端展示答案、引用、会话，并可打开 Trace 抽屉查看链路细节
```

当前实际流程对应的核心文件：

| 步骤 | 关键实现 |
|------|----------|
| RAG 接口 | `kb-mcp/rag-service/.../ChatController.java` |
| 主编排 | `ChatServiceImpl.java` |
| 查询改写 | `QueryRewritingService.java`、`KeywordFallbackService.java` |
| 向量化 | `EmbeddingServiceClient.java` |
| Milvus 检索 | `MilvusSearchService.java` |
| Rerank | `RerankServiceClient.java` |
| ACL 二次校验 | `AclVerificationService.java` |
| Parent 回捞 | `ParentLookupService.java` |
| 拒答 | `RefusalService.java` |
| Prompt 构造 | `PromptConstructionService.java` |
| Token 预算 | `PromptBudgetPlanner.java`、`TokenEstimator.java` |
| LLM 调用 | `LlmGatewayClient.java`、`llm-gateway` |
| 会话 | `SessionService.java` |
| Trace | `PipelineTraceService.java` |
| 前端 RAG 页面 | `kb-portal/web/src/app/rag/page.tsx` |

当前已完成 RAG 链路的关键特点：

1. **已经支持 SSE 流式输出**，用户不必等待完整答案生成完。
2. **已经支持会话历史**，历史消息写入 `rag_session/rag_message`。
3. **已经支持引用来源展示**，答案关联 citations。
4. **已经支持空间范围检索**，可以限定在某个知识空间及其子树。
5. **已经支持 Prompt 预算控制**，降低上下文溢出风险。
6. **已经支持 Pipeline Trace**，可定位各阶段耗时、召回数量、命中文档和 Prompt 预算。

当前 RAG 流程仍需补强：

| 缺口 | 当前表现 | 目标补强 |
|------|----------|----------|
| 单路召回为主 | Dense 向量检索为主，关键词只是 query 增强 | BM25 + FAQ + 条款 Fast Path + Dense |
| 无 RRF 融合 | Rerank 前候选主要来自 Dense | 多路候选统一 RRF 融合 |
| 查询改写较弱 | 同义词表 + 简单正则 | LLM-based rewrite，输出 mainQuery/subQueries/keywords/intent |
| 意图路由缺失 | 所有问题默认进入 RAG | POLICY_QA/DOC_SEARCH/TOOL/CHITCHAT/HUMAN 分类 |
| ACL 下推不足 | 有客户端过滤和 DB 二次校验 | Milvus 标量过滤下推 + DB 最终校验 |
| 评测缺失 | 无系统性 Recall/忠实度/引用准确率指标 | eval-service + eval_dataset/eval_case/eval_run |
| 反馈闭环不足 | 前端交互有雏形，未进入训练/评测闭环 | 反馈入库，自动生成 badcase 和 FAQ 候选 |

### 4.5 未来期望流程：文件入库增强版

未来目标不是推翻当前链路，而是在当前链路上补齐前置处理、质量评估、版本治理和多模态能力。

```text
上传文件
  → Gateway 鉴权，解析 OBO Token
  → ingest-service 校验空间权限、上传权限、文件策略
  → MinIO 存储原始文件
  → 文件前置处理
      ├── 格式识别
      ├── 病毒/安全扫描
      ├── 文件去重
      ├── 版本比对
      └── 文档质量预检
  → Parser Router
      ├── Tika 文本解析
      ├── OCR 扫描件解析
      ├── 表格结构抽取
      ├── 图表 caption/结构化摘要
      └── 多模态向量抽取
  → Metadata Extractor
      ├── 标题、作者、页码、章节
      ├── 文档类型、制度编号、生效期
      ├── 地区、业务域、密级
      ├── 标签、关键词、实体
      └── 条款编号 clause_no
  → Cleaner
      ├── 文本规范化
      ├── 页眉页脚去除
      ├── 重复段落去重
      └── PII 脱敏
  → Chunk Planner
      ├── 固定切片
      ├── 规则语义切片
      ├── LLM 边界精修
      ├── Parent-Child
      ├── 表格 chunk
      └── 图文 chunk
  → Index Builder
      ├── Dense Vector Index: Milvus
      ├── BM25 Inverted Index: PostgreSQL/OpenSearch
      ├── FAQ Candidate Index
      └── Metadata Index
  → 版本发布
      ├── 新版本 READY
      ├── 旧版本 OFFBOARDED
      ├── 旧向量异步删除或过滤
      └── 一致性巡检
  → 入库质量评估
      ├── 解析质量
      ├── 切片质量
      ├── 索引完整性
      └── SLA 统计
```

未来增强点与当前基础的对应关系：

| 未来能力 | 当前基础 | 落地策略 |
|----------|----------|----------|
| OCR/多模态 | 已有 `OCRParser` placeholder | 第三阶段替换 placeholder，按文档类型路由 |
| 表格结构解析 | `knowledge_structured` 已存在 | 扩展 sections/tables schema |
| Metadata 抽取 | 当前已有基础元数据字段 | 增加 extractor 服务或 processor 阶段 |
| BM25 索引 | 当前已有 text/title/section/tags/chunk_type | 第二阶段构建 `chunk_terms` 或 OpenSearch |
| 版本治理 | 已有 `knowledge_version` | 新版本发布后旧版本自动下线 |
| 向量删除 | 当前 Milvus upsert 已有 | 新增 vector_delete_task |
| 入库质量评估 | 当前有 quality_score | 增加质量规则和评估报表 |

### 4.6 未来期望流程：检索问答增强版

未来问答链路要从“能回答”升级为“找得准、答得稳、可评测、可治理”。

```text
用户问题
  → Gateway 鉴权，解析 OBO Token
  → user-service 获取用户上下文
      ├── tenant_id
      ├── user_id
      ├── dept_id
      ├── roles
      ├── sec_level
      └── perm_group_ids
  → Query Understanding
      ├── 意图识别
      ├── LLM 查询改写
      ├── 子问题拆解
      ├── 关键词抽取
      ├── 条款编号抽取
      └── 租户术语扩展
  → Intent Router
      ├── POLICY_QA → RAG
      ├── DOC_SEARCH → 文档搜索
      ├── STRUCTURED_TOOL → 工具调用
      ├── CHITCHAT → 轻量回答
      └── HUMAN_HANDOFF → 转人工
  → 多路召回
      ├── Dense Retriever: Milvus
      ├── BM25 Retriever: PostgreSQL/OpenSearch
      ├── FAQ Retriever: 高置信短路
      ├── Clause Retriever: 条款精确匹配
      ├── Metadata Retriever: 标签/地区/时间/空间
      └── History Retriever: 会话上下文相关召回
  → ACL 下推
      ├── tenant_id
      ├── sec_level
      ├── perm_group_id
      ├── effective_to
      └── space scope
  → RRF Fusion
      └── 合并多路候选，保留来源和分数
  → Rerank
      ├── Cross-Encoder 精排
      └── 失败 fallback
  → DB ACL Verify
      └── doc_acl/space_acl 最终校验
  → Context Assembly
      ├── Parent 回捞
      ├── 表格/图文上下文补齐
      ├── 去重
      ├── 排序
      └── Prompt Token Budget
  → LLM Generation
      ├── 模型路由
      ├── SSE 输出
      └── 成本统计
  → Post-processing
      ├── 引用格式化
      ├── 引用一致性校验
      ├── 敏感信息过滤
      ├── 拒答兜底
      └── 输出保护
  → Trace/Audit/Feedback/Eval
      ├── Pipeline Trace
      ├── LLM 调用审计
      ├── 用户反馈
      └── Badcase 入评测集
```

未来增强点与当前基础的对应关系：

| 未来能力 | 当前基础 | 落地策略 |
|----------|----------|----------|
| LLM Query Rewrite | 当前 `QueryRewritingService` 规则改写 | 在 llm-gateway 增加 rewrite 接口，失败回退规则 |
| 多路召回 | 当前 Dense + Rerank | 增加 BM25/FAQ/Clause retriever |
| RRF 融合 | 当前无融合层 | 新增 `RecallFusionService` |
| 意图路由 | 当前默认 RAG | 新增 `IntentRouter`，先接文档状态/统计/反馈工具 |
| 权限上下文 | 当前 DEV 常量 | 第三阶段接 OBO JWT 和 user-service |
| ACL 下推 | 当前客户端过滤 | 升级 Milvus 后推进标量过滤表达式 |
| 评测闭环 | 当前 Trace 可回放 | 新增 eval-service 和反馈表 |
| 成本治理 | 当前日志审计 | LLM 调用审计入库和成本看板 |

---

## 5. 阶段规划

### 5.1 阶段总览

| 阶段 | 定位 | 当前状态 | 核心目标 |
|------|------|----------|----------|
| 第一阶段 | MVP 骨架和可用闭环 | 当前项目阶段 | 搭建知识库、实现基础 RAG、可演示、可试用 |
| 第二阶段 | 检索与问答能力增强 | 待建设 | 多路召回、LLM 查询改写、意图路由、召回质量提升 |
| 第三阶段 | 企业级治理与评测 | 待建设 | 权限打通、评测体系、反馈闭环、生产治理 |

---

## 6. 第一阶段：MVP 可用闭环

### 6.1 阶段目标

第一阶段目标不是追求最强检索效果，而是打通企业知识库的最小闭环：

1. 文档可以上传、解析、切片、向量化、入库。
2. 用户可以围绕已入库文档进行问答。
3. 答案能展示引用来源。
4. 文档处理过程和 RAG 过程有基础可观测性。
5. 架构上保留权限、多路召回、评测体系的扩展点。

### 6.2 第一阶段范围

| 功能域 | 已实现能力 | 验收标准 |
|--------|------------|----------|
| 文档管理 | 上传、校验、commit、ingest、列表、状态、删除、重试 | 50MB 内文本型文档可完成入库 |
| 知识空间 | 树形空间、智能解析开关、Markdown 导入 | 文档可归属空间，RAG 可按空间范围检索 |
| 文档处理 | Tika、TextCleaner、Fixed/Semantic/LLMChunker | 文本型 PDF/Word 可解析并产生 chunk |
| 向量化 | embedding 批处理、Milvus upsert | 文档完成后状态进入 READY |
| RAG | Dense 检索、Rerank、引用、拒答 | 能回答命中文档中的问题，并返回 citations |
| 流式输出 | RAG SSE、LLM Gateway SSE | 首 Token 可逐步返回，前端可展示流式文本 |
| 会话 | 会话列表、消息保存、切换 | 刷新后可恢复历史对话 |
| 可观测 | Pipeline Trace、Prompt Budget | 可查看阶段耗时、命中文档、预算统计 |

### 6.3 第一阶段实际交付清单

为了避免“第一阶段完成了什么”过于抽象，下面从用户可见功能、后端能力、数据能力、运维可观测四个维度列出实际交付项。

#### 6.3.1 用户可见功能

| 页面/入口 | 已交付能力 | 业务价值 |
|-----------|------------|----------|
| 首页工作台 | 展示知识库概览、最近会话、常用入口 | 给领导和管理员一个统一入口 |
| 文档上传页 | 选择空间、文档类型、密级、业务域、标签、切片方式，执行上传入库 | 让业务人员无需接触后端即可完成知识入库 |
| 上传进度页 | 展示上传、解析、清洗、切片、向量化等流程步骤 | 解决“上传后不知道系统在干什么”的问题 |
| 文档列表页 | 搜索、状态展示、空间筛选、重试、删除 | 让管理员掌握文档处理情况 |
| 文档详情页 | 查看文档基础信息和 chunk 可视化入口 | 支撑入库质量检查 |
| 知识空间页 | 树形空间、创建、编辑、删除、详情 | 解决企业知识分类管理 |
| Markdown 导入空间 | 上传大纲批量创建空间 | 降低复杂分类体系初始化成本 |
| 权限设置页 | 配置空间 ACL，级联到文档 ACL | 为后续真实权限体系提供管理入口 |
| RAG 问答页 | 流式问答、空间选择、会话历史、引用展示 | 形成最终用户智能问答体验 |
| RAG 快速入库 | 在问答页快速上传文件并用于后续问答 | 降低临时资料问答使用门槛 |
| Trace 抽屉 | 查看检索问答各阶段耗时、命中文档、Prompt 预算 | 支撑研发和运维排查 badcase |
| 扩展管理页 | 本地管理 Prompts、Skills、MCP Servers | 为后续扩展生态和提示词运营预留入口 |

#### 6.3.2 后端服务能力

| 服务 | 已交付能力 | 说明 |
|------|------------|------|
| ingest-service | 文档元数据、上传、commit、ingest、状态、空间、空间 ACL、统计 | 当前是知识库管理的主服务 |
| kb-doc-processor | 文件读取、Tika 解析、清洗、切片、embedding、写入中间表、发布 embed-task | 当前承担入库处理主流程 |
| vector-service | 消费 embed-task、Milvus upsert、embed_task 状态回写、文档 READY 回写 | 当前承担向量入库和状态收口 |
| rag-service | 检索编排、Dense 召回、Rerank、ACL 校验、Parent 回捞、Prompt 构造、会话、Trace | 当前承担 RAG 主链路 |
| llm-gateway | MiniMax 代理、阻塞/流式输出、基础审计日志 | 当前承担模型调用统一出口 |
| rerank-service | 提供 BGE Reranker 精排能力 | RAG 精排依赖服务 |
| kb-portal/web | 文档、空间、RAG、设置、扩展、帮助等页面 | 当前前端主入口 |

#### 6.3.3 数据与索引能力

| 数据对象 | 当前用途 |
|----------|----------|
| `knowledge_doc` | 文档主表，记录标题、状态、空间、密级、业务域、地区、标签、文件大小等 |
| `knowledge_version` | 文档版本状态机 |
| `doc_acl` | 文档级 ACL |
| `space_acl` | 空间级 ACL |
| `knowledge_space` | 树形知识空间 |
| `knowledge_clean` | 清洗后的全文 |
| `knowledge_structured` | 结构化结果，当前保存 sections/paragraphs |
| `embed_task` | chunk 级向量化任务和状态 |
| `rag_session` / `rag_message` | RAG 会话和消息 |
| `rag_pipeline_trace` | RAG Pipeline 可观测记录 |
| `Milvus kb_documents` | 向量和标量字段，用于 Dense 检索和过滤 |

#### 6.3.4 当前阶段验收口径

| 验收项 | 当前可验收方式 |
|--------|----------------|
| 文档可入库 | 上传文本型 PDF/Word，最终状态 READY |
| 文档可检索 | 在 RAG 页面提问，命中文档内容并返回引用 |
| 会话可恢复 | 创建会话、提问、刷新页面后历史存在 |
| 空间可管理 | 创建多层空间，文档归属空间，RAG 按空间检索 |
| 链路可观察 | 每次 RAG 返回 traceId，可打开 Trace 抽屉 |
| Prompt 不溢出 | Trace 中可查看 Prompt Budget，超长引用会压缩/丢弃 |

### 6.4 第一阶段落地重点

#### 6.4.1 入库状态补强

当前状态较粗，建议在第一阶段收尾时补齐：

```text
DRAFT
  → PENDING
  → PARSING
  → CLEANING
  → CHUNKING
  → EMBEDDING
  → INDEXING
  → READY
  ↘ FAILED
```

需要新增字段：

```sql
ALTER TABLE kb_knowledge.knowledge_doc
  ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(32),
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(64),
  ADD COLUMN IF NOT EXISTS last_error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_trace_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
```

落地方式：

1. `ingest-service` 在发布 `file-ingest` 时写 `PROCESSING/QUEUED`。
2. `kb-doc-processor` 每个阶段开始和结束时更新 `pipeline_stage`。
3. `vector-service` upsert 前写 `INDEXING`，全部 DONE 后写 `READY`。
4. 失败时统一写入 `FAILED + error_code + error_message + trace_id`。

#### 6.4.2 文档删除和下线闭环

当前删除主要删除 DB 与 MinIO，后续要避免旧向量继续被召回。

建议引入两种操作：

| 操作 | 用途 | 行为 |
|------|------|------|
| 软下线 OFFBOARDED | 制度过期、临时下线 | PG 状态置 OFFBOARDED，Milvus `effective_to` 或 status 过滤不再召回 |
| 物理删除 DELETE | 用户明确删除 | 删除 MinIO、PG 元数据、Milvus 向量 |

第二阶段前可先做软下线，第三阶段补齐物理删除任务和一致性巡检。

---

## 7. 第二阶段：多路召回与智能问答增强

### 7.1 阶段目标

第二阶段解决当前最核心的检索质量问题。企业审计知识库大量问题是精确条款、制度编号、专有名词、时间范围和业务术语的混合查询，单路向量检索不足以覆盖。

第二阶段目标：

1. 从单路 Dense 检索升级为多路召回。
2. 引入 BM25 和条款 Fast Path，提高精确查询能力。
3. 引入 FAQ 短路，降低高频问题延迟和成本。
4. 使用 RRF 融合多路结果，提升召回稳定性。
5. 将 Query Rewrite 升级为 LLM-based，支持复杂追问。
6. 引入意图路由，非知识问答问题不再全部进入 RAG。

### 7.2 多路召回架构

```text
QueryPlanner
  ├── QueryRewrite：LLM 改写、关键词、子问题、术语扩展
  ├── IntentRouter：POLICY_QA / DOC_SEARCH / TOOL / CHITCHAT / HUMAN
  ├── DenseRetriever：Milvus 向量召回
  ├── BM25Retriever：关键词召回
  ├── FAQRetriever：高频问题短路
  ├── ClauseRetriever：条款编号精确匹配
  ├── MetadataRetriever：空间、标签、地区、生效期、密级过滤
  ├── RRFusion：多路融合
  ├── Reranker：精排
  └── ContextAssembler：Parent 回捞 + Prompt 预算
```

### 7.3 BM25 关键词召回

#### 7.3.1 目标

解决以下问题：

1. “第十六条规定是什么”。
2. “A-2024-09 文件里的责任边界”。
3. “某个专有名词、缩写、编号、金额、日期”。
4. 向量相似但关键词不匹配导致误召回。

#### 7.3.2 数据模型

方案一：PostgreSQL 自建倒排索引，便于第一步落地。

```sql
CREATE TABLE kb_search.chunk_terms (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    doc_id      VARCHAR(64) NOT NULL,
    version     INT NOT NULL,
    chunk_seq   INT NOT NULL,
    term        VARCHAR(128) NOT NULL,
    tf          INT NOT NULL,
    doc_len     INT NOT NULL,
    field       VARCHAR(32) NOT NULL DEFAULT 'text',
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunk_terms_query
    ON kb_search.chunk_terms (tenant_id, term);

CREATE INDEX idx_chunk_terms_doc
    ON kb_search.chunk_terms (tenant_id, doc_id, version, chunk_seq);
```

方案二：引入 Elasticsearch/OpenSearch，适合数据量增大后的生产形态。

建议路线：第二阶段先用 PostgreSQL 验证效果，再根据规模迁移到 OpenSearch。

#### 7.3.3 检索策略

BM25 分数：

```text
score(q, d) = Σ IDF(term) * TF_norm(term, d)
```

加权字段：

| 字段 | 权重 |
|------|------|
| title | 3.0 |
| section_path | 2.0 |
| keywords | 2.0 |
| tags | 1.5 |
| text | 1.0 |
| chunk_type=rule/procedure | 1.1-1.3 |

### 7.4 FAQ 高置信短路

#### 7.4.1 目标

高频问题不需要每次走完整 RAG。FAQ 短路用于：

1. 降低延迟。
2. 降低 LLM 成本。
3. 保持标准答案稳定。

#### 7.4.2 数据模型

```sql
CREATE TABLE kb_knowledge.faq_pair (
    id             BIGSERIAL PRIMARY KEY,
    tenant_id      VARCHAR(64) NOT NULL,
    space_id       VARCHAR(128),
    question       TEXT NOT NULL,
    normalized_q   TEXT NOT NULL,
    answer         TEXT NOT NULL,
    citations      JSONB NOT NULL DEFAULT '[]'::jsonb,
    embedding      JSONB,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    hit_count      BIGINT NOT NULL DEFAULT 0,
    created_by     VARCHAR(64),
    updated_at     TIMESTAMP NOT NULL DEFAULT now()
);
```

短路规则：

```text
FAQ cosine >= 0.92 且 ACL 可见 → 直接返回 FAQ answer
0.85 <= cosine < 0.92 → 作为一路召回参与 RRF
低于 0.85 → 不使用
```

### 7.5 条款编号 Fast Path

当前 `KeywordFallbackService` 已能识别“第 X 条”，但只是追加关键词。第二阶段要升级为直接精确召回。

处理流程：

```text
Query 包含条款编号
  → 提取 clause_no
  → 在 section_path/title/text 中精确匹配
  → 命中后进入候选集
  → 与 Dense/BM25 结果融合
```

必要字段：

```sql
ALTER TABLE kb_knowledge.embed_task
  ADD COLUMN IF NOT EXISTS clause_no VARCHAR(64);
```

Milvus 可增加 `clause_no` 标量字段，用于精确过滤。

### 7.6 RRF 融合

多路召回不能简单按原始分数相加，因为不同召回器分数分布不一致。建议使用 RRF：

```text
RRF(d) = Σ 1 / (k + rank_i(d))
k = 60
```

融合规则：

1. 每路召回返回 TopN。
2. 按每路内部排名计算 RRF 分。
3. 同一个 `doc_id/version/chunk_seq` 合并。
4. 保留召回来源：`dense/bm25/faq/clause/metadata`。
5. 进入 Rerank 前保留 Top50。

返回结构：

```java
record RecallCandidate(
    String docId,
    Integer version,
    Integer chunkSeq,
    String text,
    double fusedScore,
    Map<String, Double> sourceScores,
    List<String> sources
) {}
```

### 7.7 LLM-based Query Rewrite

当前同义词表覆盖有限，第二阶段建议通过 `llm-gateway` 增加查询改写能力。

输出 JSON：

```json
{
  "mainQuery": "员工试用期转正后年假规则",
  "subQueries": [
    "试用期员工转正",
    "年假计算规则",
    "入职未满一年年假"
  ],
  "keywords": ["试用期", "转正", "年假"],
  "clauseNumbers": [],
  "timeRange": null,
  "intent": "POLICY_QA"
}
```

控制要求：

1. LLM 改写必须有超时，建议 800-1500ms。
2. 失败时 fallback 到当前规则改写。
3. 改写结果写入 Pipeline Trace。
4. 支持租户术语表。

租户术语表：

```sql
CREATE TABLE kb_knowledge.tenant_synonym (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    term        VARCHAR(128) NOT NULL,
    synonyms    JSONB NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
```

### 7.8 意图路由和工具调用

问题分类：

| intent | 处理方式 |
|--------|----------|
| POLICY_QA | 走 RAG |
| DOC_SEARCH | 返回文档列表或片段 |
| STRUCTURED_TOOL | 调用工具，不走 RAG |
| CHITCHAT | 轻量模型直接回答或拒绝 |
| HUMAN_HANDOFF | 创建工单或提示人工 |

建议先接入 3 类工具：

1. `query_document_status`：查询文档处理状态。
2. `query_space_stats`：查询知识空间统计。
3. `create_feedback_ticket`：创建反馈/报错工单。

这样可以直接复用当前已有的文档状态、统计和反馈入口，风险低。

### 7.9 第二阶段验收指标

| 指标 | 第一阶段基线 | 第二阶段目标 |
|------|--------------|--------------|
| 精确条款查询 Recall@5 | 待测 | 提升 30% 以上 |
| 高频 FAQ 平均延迟 | 完整 RAG 延迟 | < 500ms |
| 普通 RAG 首 Token | 已支持 SSE | P95 < 1.5s |
| Rerank 后引用准确率 | 待测 | Top3 引用人工准确率 > 85% |
| 拒答准确率 | 基础阈值 | 无资料问题拒答准确率 > 90% |
| Badcase 可定位性 | Trace 已有 | 每条 badcase 可回放召回、融合、精排过程 |

---

## 8. 第三阶段：权限打通、评测体系与生产治理

### 8.1 阶段目标

第三阶段重点不是继续堆功能，而是让系统具备企业级可信运行能力。

目标：

1. 打通统一认证和权限上下文。
2. 建立可规模化评测体系。
3. 建立反馈闭环和持续优化机制。
4. 补齐审计、成本、限流、告警、容量规划。
5. 支持生产环境多租户隔离和安全合规。

#### 8.1.1 第三阶段实施前置条件与复用边界

结合当前企业基础设施情况，第三阶段不按“从零建设统一认证和网关”评估，而是复用 BladeX 和既有基础网关能力，在知识库侧完成协议适配、权限上下文标准化、资源服务鉴权和 RAG 权限过滤闭环。

已具备或明确的前置条件：

| 前置条件 | 当前判断 | 对方案的影响 |
|----------|----------|--------------|
| BladeX OAuth2 接口 | authorize、token、userinfo/introspection、用户、租户、部门、角色等接口已明确 | `auth-adapter-service` 重点做协议适配和 claims 标准化，不重建 IAM |
| 基础网关能力 | 已具备 JWT 验签、路由转发、基础鉴权和扩展能力 | `kb-gateway` 重点配置 KB/OCR/MCP 路由策略、tenant 绑定和审计 |
| 组织权限来源 | 用户、部门、角色、租户来源清楚 | `user-service` 重点做聚合、缓存、权限组计算 |
| 当前 ACL 基础 | 已有 `space_acl`、`doc_acl`、Milvus 权限 metadata | 第三阶段是接入真实用户上下文，不重做知识权限模型 |
| Trace 基础 | RAG trace、pipeline trace 已有 | 第三阶段扩展 token、gateway、资源鉴权和 denied_ids 审计 |

复用与新增边界：

| 能力 | 复用内容 | 本项目新增内容 |
|------|----------|----------------|
| 身份认证 | BladeX OAuth2 作为身份权威源 | `auth-adapter-service` 提供 OIDC facade、JWKS、Token Exchange、统一 claims |
| 网关 | 企业基础网关的路由、验签、扩展机制 | KB/OCR/MCP 路由级 `aud/scope/tenant` 策略和审计字段 |
| 用户组织 | BladeX 用户、部门、角色、租户数据 | `user-service` 用户上下文聚合、权限组计算、缓存和失效 |
| 知识权限 | 当前 `space_acl`、`doc_acl`、metadata 字段 | OBO claims 驱动的 Milvus 预过滤和 DB ACL 后过滤 |
| 审计追踪 | 当前 pipeline trace、search trace | token exchange、gateway deny、resource deny、ACL denied 全链路审计 |

因此第三阶段的关键工作不是重复造统一认证或统一网关，而是把企业现有认证网关能力落到知识库的上传、检索、问答、引用和审计链路中。

### 8.2 第三阶段权限体系总设计

第三阶段的权限建设目标，是把第一阶段已经具备的数据权限基础，升级为企业统一身份、统一权限上下文、统一资源服务鉴权、统一审计的闭环。核心原则是：上层应用只负责交互和编排，不直接拥有知识权限；知识权限、检索过滤和最终授权统一收敛在知识库服务侧。

#### 8.2.1 当前基础与第三阶段目标

当前项目已经具备的权限基础：

| 能力 | 当前状态 | 第三阶段演进目标 |
|------|----------|------------------|
| 租户字段 | 文档、chunk、向量 metadata 已保留 `tenant_id` | 接入真实租户上下文，禁止开发态常量 |
| 用户上下文 | 当前存在 `DEV_TENANT_ID`、`DEV_USER_ID`、`DEV_PERM_GROUP_IDS` | 由 OBO JWT Claims 和 user-service 提供 |
| 空间权限 | 已有 `space_acl`，支持空间 READ/WRITE/ADMIN | 与统一用户、角色、部门、权限组打通 |
| 文档权限 | 已有 `doc_acl`，支持 USER/ROLE/DEPT 维度 | 作为最终授权权威来源 |
| 向量权限字段 | Milvus metadata 已包含 `sec_level`、`perm_group_id`、`acl_version`、`region_code`、`biz_domain`、`effective_from/to` | 检索阶段生成可执行的 Milvus 标量过滤表达式 |
| RAG 权限过滤 | 已有客户端 ACL 过滤与数据库二次校验 | 升级为 Token claims 驱动的预过滤 + DB 权威后过滤 |
| 审计 | 已有 search audit、pipeline trace 基础 | 扩展到 token、gateway、资源服务、denied_ids 全链路审计 |

第三阶段不是从零建设权限，而是把已有权限数据模型和检索链路里的扩展点接入真实企业身份体系。

#### 8.2.2 设计原则

1. **统一身份来源**：以企业统一认证体系为权威身份源，优先对接 BladeX OAuth2，不在知识库内自建孤立账号体系。
2. **统一 OBO 链路**：上层应用通过 OIDC 登录获得 `user_access_token`，调用 KB/OCR/MCP 前必须执行 Token Exchange 获取短期 `obo_access_token`。
3. **资源服务不信任前端头**：前端传入的 `X-User-Id`、`tenantId`、`role` 只能用于展示或兼容，不作为安全边界。
4. **网关校验 + 服务二次校验**：Gateway 校验 `iss/aud/scope/tenant`，ingest/rag/vector 等资源服务仍必须验签和校验 claims，防止绕过网关。
5. **向量预过滤 + 数据库后过滤**：Milvus metadata 用于缩小候选集合，PostgreSQL 的 `doc_acl/space_acl` 是最终授权依据。
6. **撤权优先正确性**：撤权、降密、组织调整时，数据库 ACL 后过滤立即生效；向量 metadata 异步刷新，不允许 metadata 陈旧造成越权。
7. **租户强隔离**：所有业务表、索引 metadata、审计日志必须带 `tenant_id`；高合规租户可升级到独立 schema、独立库或独立向量集群。

禁止模式：

1. 前端自行注入 `X-User-Id`、`X-Tenant-Id` 并被后端直接信任。
2. 上层应用直接访问 Milvus、PostgreSQL、MinIO、ES 等底层知识资产。
3. Dify、IM 机器人、业务门户等编排端各自实现知识权限判断。
4. 多个后端服务各自维护不一致的用户、角色、部门和密级解析逻辑。

#### 8.2.3 统一认证与 OBO 链路

第三阶段建议新增 `auth-adapter-service`，在不侵入 BladeX OAuth2 核心的前提下，对外提供 OIDC 标准端点和 RFC8693 Token Exchange 能力，对内对接 BladeX 的 authorize/token/userinfo/introspection 以及组织权限数据。

整体链路：

```text
用户访问知识库门户 / Dify / IM / 业务系统
  → 上层应用跳转 auth-adapter OIDC 登录
  → auth-adapter 对接 BladeX OAuth2 完成认证
  → 上层应用获得 user_access_token
  → 上层应用在调用 KB MCP 前执行 Token Exchange
  → auth-adapter 签发 aud=mcp-kb 的短期 obo_access_token
  → gateway 校验 iss/aud/scope/tenant/exp
  → rag-service / ingest-service / vector-service 二次校验 OBO JWT
  → 服务根据 claims 生成权限过滤条件
  → Milvus 预过滤 + PostgreSQL ACL 后过滤
  → 返回带引用、trace_id、权限审计结果的答案
```

OCR 或其他 MCP 服务采用相同模式，只是 `audience` 和 `scope` 不同：

| 资源服务 | OBO `aud` | 最小 scope | 说明 |
|----------|-----------|------------|------|
| KB 检索问答 | `mcp-kb` | `kb:search` | 查询、召回、生成、引用 |
| KB 上传入库 | `mcp-kb` | `kb:upload` | 文件上传、解析、切片、向量入库 |
| KB 管理 | `mcp-kb` | `kb:admin` | 空间管理、ACL 管理、重建索引 |
| OCR 服务 | `mcp-ocr` | `ocr:invoke` | 扫描件识别、图片解析 |
| OCR 管理 | `mcp-ocr` | `ocr:admin` | OCR 配置、额度、模型管理 |

#### 8.2.4 auth-adapter-service 设计

`auth-adapter-service` 的定位是企业统一认证和知识库资源服务之间的标准化适配层。

核心职责：

| 模块 | 职责 |
|------|------|
| `upstream-client` | 对接 BladeX OAuth2 的 authorize、token、userinfo、introspection |
| `oidc-facade` | 提供 OIDC discovery、JWKS、authorize、token、userinfo |
| `token-service` | 签发 JWT，控制 `audience/scope/exp/jti/kid`，执行 Token Exchange |
| `context-service` | 聚合用户、租户、部门、角色、密级、区域、业务域、权限组 |
| `client-registry` | 管理上层应用 client、密钥、允许 audience、允许 scope |
| `audit-service` | 记录 token 签发、失败、撤销、key 轮换审计 |

必须提供的端点契约：

| API | 用途 | 验收要求 |
|-----|------|----------|
| `GET /.well-known/openid-configuration` | OIDC Provider Discovery | 上层应用可按标准 OIDC Client 配置 |
| `GET /oauth2/jwks` | 发布 JWT 验签公钥 | gateway 和资源服务可按 `kid` 自动验签 |
| `GET /authorize` | OIDC 授权码登录入口 | 可重定向到 BladeX 并完成 code 回调 |
| `POST /oauth2/token` | 签发 user token 或 OBO token | 支持 `authorization_code` 和 token exchange |
| `GET /userinfo` | 标准化用户信息 | 返回字段与 JWT claims 保持一致 |

Token Exchange 请求：

```text
POST /oauth2/token
Authorization: Basic base64(client_id:client_secret)
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token_type=urn:ietf:params:oauth:token-type:access_token
subject_token=<USER_ACCESS_TOKEN>
audience=mcp-kb
scope=kb:search
```

Token Exchange 决策逻辑：

```text
validate_client(client_id, client_secret)
validate_subject_token(subject_token)
ctx = resolve_user_context(subject_token)
assert ctx.status == ACTIVE
assert audience in client.allowed_audiences
scopes = requested_scopes ∩ client.allowed_scopes ∩ ctx.granted_scopes
assert scopes not empty
obo = sign_jwt(
  iss=auth_adapter_issuer,
  sub=ctx.uid,
  aud=audience,
  scope=scopes,
  exp=now+300s,
  claims=ctx.permission_claims,
  kid=current_kid
)
write_token_audit(result=SUCCESS)
return obo
```

与 BladeX OAuth2 的对接策略：

| BladeX Token 类型 | 处理方式 |
|-------------------|----------|
| JWT token | auth-adapter 获取 BladeX JWKS 或公钥后验签，提取 `uid/tenant/roles` |
| Opaque token | auth-adapter 调用 introspection 获取 active、uid、tenant，再回源 user-service 补齐上下文 |
| userinfo 可用 | 用 userinfo 补齐昵称、部门、角色等展示字段 |
| userinfo/introspection 不可用 | 默认 fail-closed，不签发新 OBO token；如使用缓存，必须降低权限并记录 `ctx_ver` |

密钥管理要求：

1. JWT 签名建议使用 RS256。
2. 私钥放入 KMS/Vault，不落入镜像和配置文件。
3. JWKS 至少保留 current 和 previous 两把 key，避免资源服务缓存导致验签失败。
4. gateway 和资源服务缓存 JWKS 5-15 分钟，验签失败时强制刷新一次。
5. 允许 `iat/nbf` 30-60 秒时钟偏移，所有节点必须开启时间同步。

#### 8.2.5 Token 类型与 Claims 规范

第三阶段至少区分两类 token：

| Token | 使用者 | audience | 生命周期 | 用途 |
|-------|--------|----------|----------|------|
| `user_access_token` | 上层应用 | 上层应用 `client_id` | 5-15 分钟 | 登录态、展示用户信息、换取 OBO token |
| `obo_access_token` | KB/OCR/MCP 资源服务 | `mcp-kb` 或 `mcp-ocr` | 5 分钟 | 资源服务鉴权、检索权限过滤、审计 |

OBO JWT claims 建议：

```json
{
  "iss": "https://auth-adapter.example.com",
  "aud": "mcp-kb",
  "sub": "u123",
  "uid": "u123",
  "tenant_id": "tenant-a",
  "role_codes": ["USER", "DEPT_ADMIN"],
  "dept_ids": ["D01", "D02"],
  "dept_path": "集团.审计部.一处",
  "sec_level": 3,
  "region_scopes": ["CN-SH", "CN-BJ"],
  "biz_domain_scopes": ["audit", "finance"],
  "project_tags": ["audit-2026"],
  "perm_group_ids": [1, 7, 12],
  "scope": "kb:search",
  "ctx_ver": "2026-05-09T10:00:00Z",
  "jti": "token-unique-id",
  "iat": 1778292000,
  "exp": 1778292300
}
```

字段说明：

| Claim | 说明 | 使用位置 |
|-------|------|----------|
| `iss` | auth-adapter 固定签发方 | gateway、资源服务验签 |
| `aud` | 资源服务 audience | 防止 KB token 调 OCR 或反向滥用 |
| `tenant_id` | 租户 | 表查询、Milvus expr、审计 |
| `uid` / `sub` | 用户唯一标识 | ACL、审计、反馈 |
| `role_codes` | 角色编码 | RBAC、空间权限、文档权限 |
| `dept_ids` | 部门集合 | DEPT ACL、权限组计算 |
| `sec_level` | 用户可访问密级上限 | Milvus 预过滤、DB 后过滤 |
| `region_scopes` | 可访问地区范围 | 区域类知识隔离 |
| `biz_domain_scopes` | 可访问业务域 | 审计、财务、法务等域隔离 |
| `perm_group_ids` | 权限组集合 | 避免 Milvus 生成超长 `dept_id IN (...)` |
| `scope` | 操作权限 | API 级鉴权 |
| `ctx_ver` | 用户上下文版本 | 排查权限变更一致性 |
| `jti` | token 唯一 ID | 审计、黑名单、紧急吊销 |

#### 8.2.6 user-service 用户上下文

`user-service` 作为 BladeX 用户、组织、角色和权限组数据的聚合层与缓存层，避免 `auth-adapter-service`、gateway、rag-service 各自回源解析用户上下文。

核心接口：

```text
GET /user/v1/context
Authorization: Bearer <user_access_token or obo_access_token>
```

响应示例：

```json
{
  "tenant_id": "tenant-a",
  "uid": "u123",
  "display_name": "张三",
  "status": "ACTIVE",
  "role_codes": ["USER", "DEPT_ADMIN"],
  "dept_ids": ["D01", "D02"],
  "dept_path": "集团.审计部.一处",
  "sec_level": 3,
  "region_scopes": ["CN-SH"],
  "biz_domain_scopes": ["audit"],
  "perm_group_ids": [1, 7, 12],
  "ctx_ver": "2026-05-09T10:00:00Z"
}
```

缓存和一致性：

| 数据 | 缓存建议 | 失效方式 |
|------|----------|----------|
| 用户基础上下文 | Redis TTL 3 分钟 | 用户变更事件、手动失效 |
| BladeX introspection 结果 | TTL 30-60 秒 | token 过期或撤销 |
| 权限组映射 | TTL 3-5 分钟 | 组织、角色、ACL 模板变更 |
| JWKS | TTL 5-15 分钟 | kid 轮换、验签失败刷新 |

#### 8.2.7 权限模型：RBAC + ABAC + ACL + PermGroup

第三阶段的权限模型由四类机制共同完成。

| 模型 | 解决的问题 | 示例 |
|------|------------|------|
| RBAC | 操作权限和管理权限 | `kb:search`、`kb:upload`、`space:admin` |
| ABAC | 属性型数据权限 | `sec_level <= user.sec_level`、`region_code in user.region_scopes` |
| ACL | 空间、文档级授权 | `space_acl`、`doc_acl` 的 USER/ROLE/DEPT 授权 |
| PermGroup | 检索侧高性能权限过滤 | `perm_group_id IN [1,7,12]` |

知识权限分层：

| 层级 | 当前基础 | 第三阶段要求 |
|------|----------|--------------|
| 租户级 | `tenant_id` 已贯穿文档和向量 | 所有查询强制 `tenant_id` 过滤 |
| 空间级 | `space_acl` 已支持 | 上传、管理、空间内检索前置校验 |
| 文档级 | `doc_acl` 已支持 | 检索后 DB 权威校验 |
| Chunk 级 | 默认继承文档 | 特殊段落可扩展 override，但需谨慎 |
| 密级 | `sec_level` metadata 已存在 | 用户密级不足时不可召回 |
| 业务域/地区 | `biz_domain`、`region_code` 已存在 | 按 claims 生成过滤表达式 |
| 生效期 | `effective_from/to` 已存在 | 过期知识不进入默认候选 |

权限组用于解决 Milvus 表达式过长和部门/角色组合复杂的问题：

```text
用户可访问的 USER/ROLE/DEPT/ACL 模板集合
  → user-service 计算 perm_group_ids
  → 文档入库时写入 chunk metadata.perm_group_id
  → 检索时使用 perm_group_id IN (...)
  → 命中后仍按 doc_acl/space_acl 做最终校验
```

PermGroup 落地机制：

| 对象 | 建议字段 | 说明 |
|------|----------|------|
| `perm_group` | `id, tenant_id, group_hash, subject_type, subject_ids, sec_level, region_scope, biz_domain_scope, version` | 表示一组可复用的数据权限集合 |
| `perm_group_member` | `tenant_id, perm_group_id, uid, role_code, dept_id, effective_from, effective_to` | 用户、角色、部门与权限组的映射 |
| `doc_perm_group` | `tenant_id, doc_id, version_id, perm_group_id, acl_version` | 文档版本可被哪些权限组访问 |
| `chunk_acl_metadata` | `chunk_id, doc_id, perm_group_id, acl_version, metadata_refreshed_at` | 用于向量 metadata 刷新和一致性巡检 |

计算策略：

1. 文档提交或 ACL 变更时，根据 `doc_acl`、`space_acl`、密级、地区、业务域生成文档侧 `doc_perm_group`。
2. 用户登录或上下文刷新时，`user-service` 根据用户的 uid、role、dept、sec_level、region、biz_domain 计算可访问的 `perm_group_ids`。
3. chunk 入 Milvus 时写入当前文档版本对应的 `perm_group_id` 和 `acl_version`。
4. 检索时优先使用 `perm_group_id IN (...)` 缩小候选，再用 DB ACL 做最终确认。
5. 如果一个文档面向多个权限组，可以采用多值 metadata 或复制多条权限映射记录；具体方案以 Milvus 字段能力和压测结果确定。

一致性策略：

| 变更类型 | 立即生效方式 | 异步修复方式 |
|----------|--------------|--------------|
| 文档撤权 | DB ACL 后过滤立即拒绝 | 发布 `acl-metadata-refresh` 任务刷新 Milvus metadata |
| 文档授权新增 | DB ACL 立即允许，但 Milvus 预过滤可能暂时召回不到 | 刷新 `doc_perm_group` 和 chunk metadata |
| 用户调岗/离职 | OBO token 短期过期 + user context 缓存失效 | 重算用户 `perm_group_ids` |
| 密级调整 | DB 后过滤按最新密级拒绝 | 更新 chunk `sec_level` 和 `acl_version` |
| 地区/业务域调整 | DB 后过滤兜底 | 更新 Milvus `region_code/biz_domain` |

巡检任务：

1. 定时抽样比对 `doc_acl/space_acl/doc_perm_group` 与 Milvus metadata。
2. 发现 `acl_version` 不一致时生成刷新任务。
3. 刷新失败进入 DLQ，并在权限治理看板暴露。
4. 对撤权类变更设置更高优先级，保证正确性优先于召回完整性。

#### 8.2.8 RAG 检索权限控制

第三阶段的 RAG 权限控制分为四道关口。

| 关口 | 位置 | 控制内容 | 失败处理 |
|------|------|----------|----------|
| API 操作鉴权 | gateway + rag-service | `aud=mcp-kb`、`scope=kb:search`、tenant 绑定 | 直接 401/403 |
| Milvus 预过滤 | vector-service | tenant、密级、权限组、地区、业务域、生效期 | 不进入候选集 |
| DB ACL 后过滤 | rag-service / knowledge-service | `doc_acl`、`space_acl`、文档状态、版本状态 | 从候选中剔除并记录 |
| 答案生成约束 | rag-service | 只允许基于授权后的 context 生成 | 无授权材料则拒答 |

Milvus 预过滤表达式示例：

```text
tenant_id == "tenant-a"
and sec_level <= 3
and perm_group_id in [1, 7, 12]
and region_code in ["CN-SH", "CN-BJ"]
and biz_domain in ["audit", "finance"]
and effective_from <= now()
and (effective_to is null or effective_to >= now())
```

DB 后过滤示例逻辑：

```text
candidate_chunks = milvus_search(query_vector, expr)
doc_ids = distinct(candidate_chunks.doc_id)
authorized_docs = query_doc_acl(
  tenant_id=claims.tenant_id,
  uid=claims.uid,
  roles=claims.role_codes,
  depts=claims.dept_ids,
  sec_level=claims.sec_level,
  doc_ids=doc_ids
)
filtered_chunks = candidate_chunks where doc_id in authorized_docs
write_search_audit(trace_id, denied_ids=doc_ids - authorized_docs)
```

拒答策略：

1. Milvus 预过滤后为空：返回“未检索到可用资料”，不暴露是否存在无权限文档。
2. DB ACL 后过滤为空：返回“未检索到可用资料或当前账号无权访问相关资料”，并记录 `denied_ids`。
3. 只有低置信度材料：触发低置信拒答，不强行编造。
4. 被拒绝文档不得进入 Prompt，也不得出现在引用列表中。

Milvus ACL 下推验证计划：

| 验证项 | 需要确认的问题 | 验收口径 |
|--------|----------------|----------|
| 字段类型 | `tenant_id`、`perm_group_id`、`sec_level`、`region_code`、`biz_domain`、`effective_to` 的 Milvus 类型 | 与 collection schema 一致，可建标量索引 |
| 空值表达 | `effective_to is null` 是否可用 | 若不稳定，改用最大时间哨兵值 |
| 多权限组 | `perm_group_id IN (...)` 表达式长度和性能 | 常见用户权限组数量下 P95 可控 |
| 标量索引 | 高频过滤字段是否建 scalar index | tenant、sec_level、perm_group 至少建立可用索引 |
| TopK 放大 | 权限过滤后候选不足时如何补偿 | 过滤后 TopN 满足 Prompt 构造需要 |
| 性能压测 | 10万、100万、1000万 chunk 下过滤耗时 | 达到 SLO 后再进入生产 |
| 正确性压测 | 多租户、跨部门、撤权、metadata 陈旧场景 | 越权召回率为 0 |

Milvus 表达式需要在真实版本和真实数据规模下验证，方案评审通过不等于可直接生产启用。第三阶段进入开发前应先完成小规模 Spike，确认表达式兼容性、索引策略和 P95 延迟。

#### 8.2.9 多租户隔离

多租户隔离分三级实施。

| 等级 | 方式 | 适用场景 |
|------|------|----------|
| L1 逻辑隔离 | 共享库表、共享 Milvus collection，所有表和 metadata 强制 `tenant_id` | 默认方案，成本最低 |
| L2 Schema/库隔离 | 租户独立 schema 或独立 PostgreSQL database，Milvus 按租户 collection | 监管要求较高或大租户 |
| L3 集群隔离 | 独立网关、数据库、Milvus、MinIO、消息队列 | 高合规、专有化部署 |

强制约束：

1. Gateway 校验 `token.tenant_id` 与 path、host 或 header 中的租户绑定关系。
2. 后端服务禁止使用请求体中的 `tenant_id` 覆盖 token claims。
3. 所有业务表、审计表、任务表都必须有 `tenant_id`。
4. 所有 Milvus/ES 查询必须自动拼接 `tenant_id` 条件。
5. MinIO object key 建议包含租户前缀：`tenant_id/space_id/doc_id/version/...`。

#### 8.2.10 Gateway 与资源服务强制策略

Gateway 路由级策略示例：

```yaml
routes:
  - id: kb-rag
    path: /api/kb/rag/**
    required_issuer: https://auth-adapter.example.com
    required_audiences: [mcp-kb]
    required_scopes: [kb:search]
    tenant_binding_mode: path_or_header

  - id: kb-ingest
    path: /api/kb/ingest/**
    required_issuer: https://auth-adapter.example.com
    required_audiences: [mcp-kb]
    required_scopes: [kb:upload]
    tenant_binding_mode: path_or_header

  - id: ocr
    path: /api/ocr/**
    required_issuer: https://auth-adapter.example.com
    required_audiences: [mcp-ocr]
    required_scopes: [ocr:invoke]
    tenant_binding_mode: path_or_header
```

资源服务二次校验要求：

| 服务 | 必须校验 | 说明 |
|------|----------|------|
| `ingest-service` | `aud=mcp-kb`、`kb:upload`、空间 WRITE/ADMIN | 上传、解析、入库前检查空间权限 |
| `rag-service` | `aud=mcp-kb`、`kb:search`、空间 READ | 查询、Prompt 构造、引用返回 |
| `vector-service` | `aud=mcp-kb`、tenant、权限过滤 expr | 不允许无权限检索直接调用 |
| `knowledge-service` | `doc_acl/space_acl` | 最终授权判断 |
| `ocr-service` | `aud=mcp-ocr`、`ocr:invoke` | OCR 调用独立 audience |

#### 8.2.11 审计、错误码与安全事件

auth-adapter 审计字段：

| 字段 | 说明 |
|------|------|
| `trace_id` | 全链路追踪 ID |
| `client_id` | 上层应用 |
| `uid` / `tenant_id` | 用户与租户 |
| `grant_type` | `authorization_code` 或 token exchange |
| `audience` / `scopes` | 目标资源与权限 |
| `result` | SUCCESS / FAILED |
| `error_code` | 失败码 |
| `kid` / `jti` | 签名 key 与 token 唯一 ID |

gateway 和资源服务审计字段：

| 字段 | 说明 |
|------|------|
| `trace_id` | 贯穿 gateway、rag、vector、llm |
| `uid` / `tenant_id` | 请求主体 |
| `aud` / `scopes` | token 授权范围 |
| `resource` | API、space、doc、chunk |
| `result` | ALLOW / DENY |
| `denied_reason` | issuer/aud/scope/tenant/acl/sec_level 等 |
| `denied_ids` | 被 ACL 后过滤剔除的 doc/chunk |
| `latency_ms` | 权限校验耗时 |

建议错误码：

| 错误码 | 场景 | 策略 |
|--------|------|------|
| `invalid_client` | client 密钥错误或无权 token exchange | 拒绝并审计 |
| `invalid_grant` | subject token 无效、过期、issuer 不符 | 拒绝并审计 |
| `invalid_request` | 缺少 audience 或 audience 不在白名单 | 拒绝并审计 |
| `insufficient_scope` | scope 不足 | 拒绝并审计 |
| `access_denied` | 用户禁用、租户冻结、权限不足 | 拒绝并审计 |
| `upstream_unavailable` | BladeX introspection/userinfo 不可用 | fail-closed |
| `tenant_mismatch` | token 租户与请求租户不一致 | 拒绝并告警 |
| `acl_denied` | DB ACL 后过滤拒绝 | 不返回资料，记录 denied_ids |

#### 8.2.12 第三阶段权限落地任务拆解

| 任务 | 主要工作 | 依赖 | 验收标准 |
|------|----------|------|----------|
| 认证适配器 MVP | OIDC discovery、JWKS、authorize、token、userinfo、Token Exchange | BladeX OAuth2 端点、client 注册 | 可登录、可签发 user token 和 OBO token |
| client 与 scope 管理 | 管理 `client_id`、secret、allowed audience、allowed scopes | auth-adapter | 非白名单 audience/scope 被拒绝 |
| user-service 上下文 | 聚合租户、用户、部门、角色、密级、权限组 | BladeX 用户组织数据 | `/user/v1/context` 返回稳定上下文 |
| gateway 策略 | 路由级 `iss/aud/scope/tenant` 校验 | JWKS、OBO token | 伪造 token、aud 错误、tenant 错误均拒绝 |
| 服务二次校验 | ingest/rag/vector/ocr 内部校验 JWT | auth-adapter JWKS | 绕过 gateway 直接调服务仍被拒绝 |
| DEV 常量替换 | 移除 `DEV_TENANT_ID/DEV_USER_ID/DEV_PERM_GROUP_IDS` 业务依赖 | user-service、JWT claims | 所有权限来自 claims 或 user context |
| Milvus ACL 下推 | 根据 claims 生成 `tenant/sec/perm_group/region/domain/effective` expr | 向量 metadata 已有字段 | 未授权 chunk 不进入候选 |
| DB ACL 后过滤 | 基于 `doc_acl/space_acl` 做最终确认 | 当前 ACL 表 | metadata 陈旧不造成越权 |
| 权限审计 | token/gateway/rag/vector denied_ids 入库 | trace_id 规范 | 可回放一次越权拒绝全过程 |
| 权限回归测试 | 构造用户、部门、角色、密级、租户测试集 | 测试数据 | 越权召回率为 0 |

#### 8.2.13 权限验收与测试用例

协议级验收：

1. OIDC discovery 能被标准 OIDC Client 正确解析。
2. JWKS 返回至少一把可用 `kid`，新旧 key 重叠期内均可验签。
3. Token Exchange 支持 audience 白名单、scope 收敛、短期过期。
4. `aud=mcp-ocr` 的 token 调 KB 接口必须被拒绝。
5. 非 auth-adapter issuer 的 token 必须被拒绝。

安全级验收：

1. 伪造 `X-User-Id`、`X-Tenant-Id` 不能绕过权限。
2. `token.tenant_id` 与请求租户不一致必须拒绝。
3. 用户被禁用或租户被冻结后不能签发新 OBO token。
4. subject token 过期、撤销、issuer 不匹配时 token exchange 必须失败。
5. 直接绕过 gateway 调 rag/vector/ingest 内网接口也必须被资源服务拒绝。

RAG 权限验收：

1. 同一问题，不同部门用户返回不同 citations，且都只包含授权文档。
2. 低密级用户无法召回高密级 chunk。
3. 撤销某用户文档权限后，DB ACL 后过滤立即生效。
4. Milvus metadata 未刷新时，后过滤仍能阻断越权。
5. `denied_ids` 可在审计日志中查询到，并能关联 trace 回放。
6. 无授权资料时，Prompt 中不包含被拒绝 chunk，答案不暴露无权限文档标题或内容。

运维级验收：

1. BladeX introspection/userinfo 不可用时默认 fail-closed，并记录 `upstream_unavailable`。
2. user context 缓存击穿保护生效，同一 token 高频请求不打爆上游。
3. JWKS 轮换期间 gateway 和资源服务不中断。
4. 权限过滤耗时纳入 P95/P99 监控。
5. 越权拒绝、tenant mismatch、scope 不足等事件进入安全告警。

### 8.3 评测体系设计

#### 8.3.1 为什么必须建设评测体系

企业知识库的效果不能只靠“看起来回答不错”。没有评测体系，会出现：

1. 加了新召回策略，不知道是否真的提升。
2. 调整切片后，旧问题变差但没人发现。
3. 模型升级后，幻觉率变化不可控。
4. 用户反馈只能零散处理，无法形成持续优化。

#### 8.3.2 评测对象

| 层次 | 指标 |
|------|------|
| 解析质量 | 解析成功率、文本覆盖率、表格保真度、页码锚点准确率 |
| 切片质量 | chunk 完整性、语义边界准确率、Parent-Child 覆盖率 |
| 检索质量 | Recall@K、MRR、nDCG、精确条款命中率 |
| 精排质量 | Rerank Top3 相关性、误排率 |
| 生成质量 | 忠实度、完备度、引用准确率、拒答准确率 |
| 权限质量 | 越权召回率、误拒率 |
| 性能质量 | P50/P95/P99 延迟、首 Token、成本、失败率 |
| 用户反馈 | 点赞率、点踩率、收藏率、报错率、重复提问率 |

#### 8.3.3 评测数据模型

```sql
CREATE SCHEMA IF NOT EXISTS kb_eval;

CREATE TABLE kb_eval.eval_dataset (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    name        VARCHAR(128) NOT NULL,
    domain      VARCHAR(64),
    description TEXT,
    created_by  VARCHAR(64),
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE kb_eval.eval_case (
    id              BIGSERIAL PRIMARY KEY,
    dataset_id      BIGINT NOT NULL REFERENCES kb_eval.eval_dataset(id),
    question        TEXT NOT NULL,
    expected_answer TEXT,
    expected_docs   JSONB NOT NULL DEFAULT '[]'::jsonb,
    expected_chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
    difficulty      VARCHAR(32),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE kb_eval.eval_run (
    id              BIGSERIAL PRIMARY KEY,
    dataset_id      BIGINT NOT NULL,
    run_name        VARCHAR(128) NOT NULL,
    config_json     JSONB NOT NULL,
    status          VARCHAR(32) NOT NULL,
    started_at      TIMESTAMP NOT NULL DEFAULT now(),
    finished_at     TIMESTAMP
);

CREATE TABLE kb_eval.eval_result (
    id                  BIGSERIAL PRIMARY KEY,
    run_id              BIGINT NOT NULL REFERENCES kb_eval.eval_run(id),
    case_id             BIGINT NOT NULL REFERENCES kb_eval.eval_case(id),
    answer              TEXT,
    retrieved_docs      JSONB NOT NULL DEFAULT '[]'::jsonb,
    citations           JSONB NOT NULL DEFAULT '[]'::jsonb,
    recall_at_5         NUMERIC(8,4),
    citation_accuracy   NUMERIC(8,4),
    faithfulness_score  NUMERIC(8,4),
    completeness_score  NUMERIC(8,4),
    latency_ms          BIGINT,
    prompt_tokens       INT,
    completion_tokens   INT,
    error_message       TEXT
);
```

#### 8.3.4 自动评测流程

```text
选择评测集
  → 固定 RAG 配置
  → 批量执行问题
  → 记录召回、Rerank、Prompt、答案、引用
  → 计算检索指标
  → LLM-as-Judge 辅助评估忠实度/完备度
  → 抽样人工复核
  → 生成报告
```

#### 8.3.5 在线反馈闭环

前端反馈事件：

| 反馈 | 用途 |
|------|------|
| 点赞 | 正样本 |
| 点踩 | Badcase 候选 |
| 收藏 | 高频可靠答案 |
| 复制 | 有用性弱信号 |
| 报错 | 人工审核任务 |
| 修改建议 | 生成评测 case 或 FAQ |

反馈表：

```sql
CREATE TABLE kb_eval.answer_feedback (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    trace_id    VARCHAR(128) NOT NULL,
    session_id  VARCHAR(128),
    feedback    VARCHAR(32) NOT NULL,
    comment     TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
```

### 8.4 审计与成本治理

第三阶段审计要覆盖“认证签发、网关放行/拒绝、资源服务权限过滤、RAG 生成、LLM 成本”五类事件。同一个 `trace_id` 必须能串起 token exchange、gateway、rag、vector、DB ACL、LLM 调用和前端反馈。

认证与资源鉴权审计：

```sql
CREATE TABLE kb_audit.auth_token_audit (
    id           BIGSERIAL PRIMARY KEY,
    trace_id     VARCHAR(128) NOT NULL,
    client_id    VARCHAR(128) NOT NULL,
    uid          VARCHAR(64),
    tenant_id    VARCHAR(64),
    grant_type   VARCHAR(128) NOT NULL,
    audience     VARCHAR(64),
    scopes       TEXT,
    kid          VARCHAR(128),
    jti          VARCHAR(128),
    result       VARCHAR(32) NOT NULL,
    error_code   VARCHAR(64),
    created_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE kb_audit.resource_auth_audit (
    id             BIGSERIAL PRIMARY KEY,
    trace_id       VARCHAR(128) NOT NULL,
    uid            VARCHAR(64),
    tenant_id      VARCHAR(64) NOT NULL,
    aud            VARCHAR(64),
    scopes         TEXT,
    resource_type  VARCHAR(64) NOT NULL,
    resource_id    VARCHAR(128),
    result         VARCHAR(32) NOT NULL,
    denied_reason  VARCHAR(128),
    denied_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
    latency_ms     BIGINT,
    created_at     TIMESTAMP NOT NULL DEFAULT now()
);
```

LLM 调用审计：

```sql
CREATE TABLE kb_audit.llm_call_log (
    id                 BIGSERIAL PRIMARY KEY,
    trace_id            VARCHAR(128) NOT NULL,
    tenant_id           VARCHAR(64) NOT NULL,
    user_id             VARCHAR(64),
    provider            VARCHAR(64) NOT NULL,
    model               VARCHAR(128) NOT NULL,
    prompt_tokens       INT,
    completion_tokens   INT,
    total_tokens        INT,
    latency_ms          BIGINT,
    status              VARCHAR(32),
    error_code          VARCHAR(64),
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);
```

治理能力：

1. 按租户统计 Token 消耗、检索调用量、OCR 调用量和用户反馈。
2. 按用户/空间/模型统计调用量，识别异常高频账号和异常空间。
3. 对 token exchange 失败率、tenant mismatch、acl denied、scope denied 建立安全告警。
4. 对 RAG P95/P99、权限过滤耗时、Milvus/DB 后过滤耗时建立性能告警。
5. 对低质量回答关联 trace 回放，回看召回、权限过滤、Prompt、LLM 输出和引用。
6. 对 OBO token 签发量、失败码、audience 分布、kid 轮换状态建立认证运维看板。

---

## 9. 数据模型分层

### 9.1 核心 schema

| Schema | 职责 |
|--------|------|
| `kb_knowledge` | 文档、空间、版本、ACL、清洗结果、结构化结果、embed_task |
| `kb_audit` | 搜索审计、Pipeline Trace、认证审计、资源鉴权审计、LLM 调用审计 |
| `kb_auth` | Token、客户端、密钥、认证审计 |
| `kb_user` | 用户、部门、角色、权限组 |
| `kb_eval` | 评测集、评测任务、评测结果、用户反馈 |
| `kb_search` | BM25 倒排、FAQ、召回索引辅助表 |

### 9.2 文档生命周期

```text
DRAFT
  → PENDING
  → PROCESSING
  → READY
  → OFFBOARDED
  → DELETED
  ↘ FAILED
```

版本策略：

1. 同一 `doc_id` 可有多个 `version`。
2. 默认只召回 `status=READY AND is_current=true`。
3. 新版本 READY 后，旧版本自动 `is_current=false` 或 `OFFBOARDED`。
4. 删除向量通过异步任务执行，保证失败可重试。

---

## 10. 关键工程设计

### 10.1 Trace 设计

每次请求生成 `trace_id = tr-{uuid}`，贯穿：

```text
frontend
  → gateway
  → ingest/rag
  → Kafka message
  → doc-processor/vector-service
  → Milvus
  → llm-gateway
  → LLM
```

RAG Trace 已有字段：

1. 阶段耗时。
2. 召回数量。
3. 精排数量。
4. 引用数量。
5. 命中文档。
6. 首 Token 延迟。
7. Prompt 预算。

后续要补：

1. 多路召回各路结果。
2. RRF 分数。
3. Query Rewrite 输出。
4. Intent。
5. LLM Token 与成本。
6. 用户反馈关联。

### 10.2 Prompt 预算设计

当前已实现：

```text
inputBudget = min(contextWindowTokens * 0.75,
                  contextWindowTokens - maxCompletionTokens - safetyMarginTokens)
```

预算分配：

1. System Prompt 固定预留。
2. 用户问题固定预留。
3. 历史对话按比例保留最近轮次。
4. 引用按 Rerank 分数排序。
5. 超长引用首尾压缩。
6. 超预算引用丢弃。

第三阶段可进一步引入：

1. 按任务类型动态 Prompt 模板。
2. 按模型上下文窗口自动选择预算。
3. 引用压缩摘要缓存。
4. Prompt 实际 tokenizer 统计。

### 10.3 拒答策略

建议三级拒答：

| 拒答原因 | 触发条件 |
|----------|----------|
| NO_MATCH | 无召回结果 |
| LOW_CONFIDENCE | 召回分数或 Rerank 分数低于阈值 |
| NO_PERMISSION | 有结果但 ACL 二次校验全部失败 |

第二阶段新增：

1. FAQ 高置信直接回答。
2. FAQ 中置信参与 RAG。
3. 低置信要求模型只能说明“不确定”，不能编造。

### 10.4 安全与合规

安全边界：

1. 前端不可信，不能传入用户权限事实。
2. Gateway 校验 Token，但业务服务仍要做二次权限判断。
3. Milvus 过滤用于性能和第一道隔离，PostgreSQL ACL 二次校验用于最终安全。
4. LLM 输入前可做 PII 检测和脱敏。
5. LLM 输出后可做敏感词、越权引用、来源一致性检查。

---

## 11. 部署与容量规划

### 11.1 开发环境

当前模式：

```text
应用服务运行在宿主机
Docker 提供 PostgreSQL/Redis/MinIO/Milvus/Kafka
数据库连接：localhost:25432 → kb-postgres:5432
```

### 11.2 生产建议

| 组件 | 生产建议 |
|------|----------|
| PostgreSQL | 主从或云 RDS，审计表和 Trace 表按时间分区 |
| Redis | 哨兵或云 Redis，用于缓存和限流 |
| Kafka | 三节点以上，file-ingest/embed-task 独立 topic |
| MinIO | 分布式 MinIO 或对象存储 |
| Milvus | 独立集群，按 tenant/collection 策略评估 |
| Rerank | GPU/CPU 独立部署，超时 fallback |
| LLM Gateway | 多实例，模型供应商隔离，限流和熔断 |

### 11.3 SLO 建议

| 指标 | 目标 |
|------|------|
| 文档入库时延 | 30 页以内文本型文档 5 分钟内 READY |
| RAG 首 Token | P95 < 1.5s |
| RAG 总耗时 | P95 < 8s |
| RAG 成功率 | > 99% |
| 文档处理失败率 | < 2% |
| 越权召回率 | 0 |
| Trace 完整率 | > 99% |

---

## 12. 风险与应对

| 风险 | 表现 | 应对 |
|------|------|------|
| 文档解析质量不可控 | 扫描件、图表、表格解析差 | 分阶段引入 OCR、表格解析、多模态；低质量文档标记人工处理 |
| 多路召回调参复杂 | 召回多但噪声增加 | 建立评测集，用 Recall@K、nDCG、引用准确率驱动调参 |
| 权限链路复杂 | 用户上下文不一致导致越权或误拒 | OBO Token 作为唯一可信来源，PG ACL 二次校验兜底 |
| DEV 常量残留 | 真实试点时误用开发态 tenant/user/perm_group | 第一阶段先抽象 `CurrentUserContext`，mock 只留在 resolver 层 |
| PermGroup 膨胀 | 部门、角色、ACL 组合过多导致权限组维护复杂 | 权限组按租户和 ACL 模板归并，配合版本号、巡检和异步刷新 |
| Milvus 表达式兼容性 | scalar filter、空值、多值字段、表达式长度影响性能或可用性 | 第三阶段先做 ACL 下推 Spike，验证字段类型、索引和 P95 延迟 |
| LLM 幻觉 | 无资料时编造答案 | 检索阈值、拒答模板、引用校验、LLM-as-Judge 评测 |
| 成本不可控 | 高频问题反复调用大模型 | FAQ 短路、缓存、限流、Prompt 预算、模型路由 |
| 向量一致性 | 删除/更新后旧向量仍可召回 | 引入 vector_delete_task、版本过滤、巡检任务 |
| 可观测不足 | 出问题无法定位 | Trace、阶段耗时、召回详情、LLM 审计、反馈关联 |

---

## 13. 分阶段交付计划

### 第一阶段：MVP 完善收口

周期建议：2-3 周。

交付物：

1. 文档处理阶段状态持久化。
2. 文档失败错误原因持久化和前端展示。
3. 文档软下线机制。
4. RAG Trace 查询和问题回放基础页面。
5. `CurrentUserContext` 抽象，业务代码不再直接依赖 DEV tenant/user/perm_group 常量。
6. 当前功能回归测试和演示数据集。

### 第二阶段：多路召回和问答增强

周期建议：4-6 周。

交付物：

1. BM25 关键词召回。
2. 条款编号 Fast Path。
3. FAQ 短路。
4. RRF 融合。
5. LLM-based Query Rewrite。
6. IntentRouter 初版。
7. 多路召回 Trace 可视化。
8. 检索评测集 V1。

### 第三阶段：权限、评测、治理

周期建议：6-8 周。

周期成立的前提：

1. BladeX OAuth2 接口、用户组织字段、租户字段和 token 类型已经明确。
2. 企业基础网关已经具备 JWT 验签、路由级策略、trace 注入和审计扩展能力。
3. 第三阶段不重建 IAM 和通用网关，只做知识库侧协议适配、claims 标准化和资源服务鉴权闭环。
4. 第一阶段已完成 `CurrentUserContext` 抽象，业务代码不再直接依赖 DEV 常量。

子里程碑：

| 里程碑 | 周期建议 | 交付物 | 验收标准 |
|--------|----------|--------|----------|
| 3A 认证与 OBO 最小闭环 | 1-2 周 | `auth-adapter-service`，OIDC discovery、JWKS、authorize、token、userinfo、Token Exchange；BladeX JWT/opaque token 解析；client/audience/scope 白名单 | 可登录，可签发 `user_access_token` 和 `obo_access_token`；非白名单 audience/scope 被拒绝 |
| 3B Gateway 与资源服务鉴权 | 1-2 周 | KB/OCR/MCP 路由策略，`iss/aud/scope/tenant` 校验，trace 注入，ingest/rag/vector/ocr 二次验签 | 伪造 token、aud 错误、scope 不足、tenant mismatch、绕过网关直连服务均被拒绝 |
| 3C 用户上下文与权限组 | 1-2 周 | `user-service`，`/user/v1/context`，用户/部门/角色/密级/地区/业务域聚合，`perm_group` 计算和缓存失效 | 所有业务权限事实来自 OBO claims 或 user context；DEV 常量完全退出业务链路 |
| 3D RAG 权限过滤与审计 | 1-2 周 | Milvus ACL 下推 Spike，scalar index，DB ACL 后过滤，`denied_ids` 审计，ACL metadata 刷新和巡检任务 | 多租户、部门、角色、密级、撤权、metadata 陈旧场景越权召回率为 0 |
| 3E 评测、反馈与生产治理 | 2 周 | Eval Service、评测数据模型、权限回归测试集、用户反馈入库、LLM 成本审计、监控告警、限流、DLQ、JWKS 轮换演练 | 发布前可跑固定评测集；Trace 完整率、RAG P95、权限过滤耗时、失败率进入看板 |

关键交付清单：

1. `auth-adapter-service` MVP：OIDC discovery、JWKS、authorize、token、userinfo、RFC8693 Token Exchange。
2. BladeX OAuth2 对接：支持 JWT/opaque token 两类上游 token 解析，补齐 userinfo/introspection 回源策略。
3. client、audience、scope 管理：为知识库门户、Dify/编排端、OCR 调用方配置白名单和最小权限。
4. `user-service` 用户上下文：聚合租户、用户、部门、角色、密级、地区、业务域、权限组，提供 `/user/v1/context`。
5. Gateway 路由级策略：按路由校验 `iss/aud/scope/tenant`，建立 tenant binding 和拒绝审计。
6. 资源服务二次鉴权：ingest/rag/vector/ocr 不再依赖开发态常量，全部从 OBO claims 和 user context 取权限事实。
7. Milvus ACL 下推：完成表达式兼容性、标量索引、TopK 放大和性能压测，再启用生产配置。
8. PostgreSQL ACL 后过滤：以 `doc_acl/space_acl` 作为最终授权依据，支持撤权立即生效和 metadata 异步刷新。
9. PermGroup 机制：完成权限组计算、文档权限组映射、chunk metadata 刷新、ACL 版本巡检。
10. 认证与权限审计：token exchange、gateway、资源服务、`denied_ids`、tenant mismatch、scope denied 全链路入库。
11. Eval Service 与评测数据模型：覆盖检索、生成、引用、拒答、权限越权、性能和成本指标。
12. 用户反馈闭环：点赞、点踩、收藏、报错、修改建议沉淀为 badcase 和评测样本。
13. 生产治理：监控、告警、限流、DLQ、JWKS 轮换演练、上游认证不可用 fail-closed 演练。
14. 权限回归测试和越权测试集：覆盖租户、部门、角色、密级、权限组、撤权、metadata 陈旧等场景。

---

## 14. 评审关注点与回答

### 14.1 为什么不直接用 Dify

Dify 适合快速搭建知识库原型，但本项目需要：

1. 企业统一认证和 OBO 权限链路。
2. 细粒度 ACL、密级、部门、权限组、多租户隔离。
3. 文档入库过程可观测和状态机。
4. 多路召回、意图路由、行业术语和评测体系的深度定制。
5. 与现有企业系统、审计场景、数据治理规范集成。

因此本项目可以借鉴 Dify 的产品形态，但核心链路需要自研可控。

### 14.2 为什么第二阶段优先做多路召回

因为企业知识问答最核心的痛点是“找不准”。只有 Dense 检索时：

1. 精确条款和编号查询不稳定。
2. 专有名词和缩写容易漏召回。
3. 高频问题每次都走完整链路，成本高。
4. 用户信任感来自引用准确，而引用准确首先依赖召回准确。

所以第二阶段优先投入 BM25、FAQ、RRF 和查询改写，是最直接提升体验的路径。

### 14.3 为什么第三阶段再打通权限和评测

权限和评测很重要，但它们依赖前两阶段的基础能力：

1. 权限体系需要稳定的数据模型、ACL 字段和检索链路。
2. 评测体系需要可回放的 RAG Trace、多路召回结果和足够的业务 case。
3. 第一阶段先完成可用闭环，第二阶段提升检索质量，第三阶段做企业级治理，可以降低一次性建设风险。

但第三阶段不是“最后才考虑安全”，当前第一阶段已经保留 tenant、doc_acl、space_acl、sec_level、perm_group_id 等字段，后续是替换开发态用户上下文为真实 JWT/OBO。

---

## 15. 总结

本方案建议把企业 AI 知识库建设拆成三个阶段：

1. **第一阶段：MVP 可用闭环。** 当前项目已经基本完成，重点是补齐状态、下线和稳定性。
2. **第二阶段：多路召回与智能问答增强。** 通过 BM25、FAQ、RRF、LLM 查询改写和意图路由解决检索准确率和成本问题。
3. **第三阶段：权限打通、评测体系与生产治理。** 通过 OBO/JWT、权限组、评测集、反馈闭环、审计和监控，让系统达到企业级可信运行。

这个路线既能承接当前工程现实，又能覆盖 PPT 中提出的知识生命周期、智能问答、多轮上下文、引用溯源、权限隔离、反馈闭环、评测体系和安全治理要求。后续每个阶段都可以形成明确交付物、验收指标和回归测试集，避免技术方案停留在概念层面。

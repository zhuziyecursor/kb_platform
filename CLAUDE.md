# kb-platform 全局开发规则

## 项目背景

企业AI知识库MVP，包含：
- `kb-mcp/`：Java Spring Boot 微服务集合
- `kb-doc-processor/`：Python 文档处理工程
- `kb-infra/`：Docker Compose 基础设施
- `kb-portal/`：前端门户

MVP 成功标准：文档上传后 5 分钟内可被检索，返回带引用的可信答案。

---

## Think-Before-Code 强制规则

**开始任何功能实现之前，必须在 Plan Mode 中完成以下 5 点确认，生成 TodoList，等用户确认后再开始实现：**

1. 确认功能属于哪个服务，是否符合该服务职责边界
2. 列出将要修改/创建的文件清单
3. 确认涉及的 DB 表是否归本服务所有（见"表所有权"章节）
4. 确认 Kafka 消息格式是否与 `contracts/kafka-schemas/` 中的 Schema 一致
5. 确认是否有 MVP 一期禁止的功能需要 PHASE2 占位标注

**标准功能开发启动 Prompt（每次开发新功能时使用）：**
```
我要在 [服务名] 中实现 [功能名]。

开始写代码前，请先：
1. 确认这个功能是否属于本服务职责（查看本服务的 CLAUDE.md 中"服务职责"）
2. 检查是否违反本文件"绝对禁止的调用"列表
3. 确认涉及的 DB 表是否在本服务"拥有的表"中
4. 列出需要创建/修改的文件
5. 确认该功能是否在 MVP 一期范围内

以上确认完毕后，生成 TodoList，我确认后再开始写代码。
```

---

## 绝对禁止的服务间调用

以下调用模式是架构错误，任何情况下都不允许实现，发现即重新设计：

| 禁止的调用 | 违反原因 | 正确替代方式 |
|-----------|---------|------------|
| ingest-service 直接 HTTP 调用 kb-doc-processor（正常流程） | 耦合，绕过 Kafka 异步 | 发布到 `file-ingest` topic |
| kb-doc-processor 调用 embedding-service | 职责越界，processor 只做文本处理 | 发布到 `embed-task` topic |
| rag-service 直接访问 PostgreSQL | rag 不拥有任何表 | 通过 Milvus 检索 + user-service 获取上下文 |
| rag-service 直接访问 MinIO | rag 不拥有存储资源 | 不需要访问，chunks 已在 Milvus 的 text 字段中 |
| vector-service 调用 kb-doc-processor | 方向错误，vector 只消费消息 | 消费 `embed-task` Kafka topic |
| 任何服务接受 X-User-Id / X-Tenant-Id / X-Roles 等自定义头 | 安全漏洞，绕过认证 | 从 OBO token JWT claims 中解析用户上下文 |
| embedding-service 接收调用方传入的 `model` 参数 | 模型固定在服务端，防漂移 | 服务端配置决定模型 |
| kb-portal 直连任何微服务（不经过 kb-gateway） | 绕过网关鉴权 | 所有请求走 kb-gateway |

---

## Kafka Topics 权威拓扑

不允许任何未列出的服务向以下 topic 生产消息：

| Topic | 生产者（唯一） | 消费者 | 消息 Schema |
|-------|-------------|--------|------------|
| `file-ingest` | ingest-service | kb-doc-processor | `contracts/kafka-schemas/file-ingest-message.json` |
| `embed-task` | kb-doc-processor | vector-service | `contracts/kafka-schemas/embed-task-message.json` |
| `user-cud` | 外部系统/auth-adapter | user-service | - |

---

## 表所有权（DB 访问规则）

每个服务只能写入自己拥有的表。跨服务写表是架构错误。

| 表名 | Schema | 拥有服务（可写） | 允许只读的服务 |
|------|--------|--------------|--------------|
| `knowledge_doc` | kb_knowledge | ingest-service | vector-service, rag-service |
| `doc_acl` | kb_knowledge | ingest-service | rag-service |
| `knowledge_version` | kb_knowledge | ingest-service(INSERT) / vector-service(UPDATE status) | rag-service |
| `knowledge_clean` | kb_knowledge | kb-doc-processor | 无 |
| `knowledge_structured` | kb_knowledge | kb-doc-processor | 无 |
| `embed_task` | kb_knowledge | kb-doc-processor(INSERT) / vector-service(UPDATE) | 无 |
| `user_context_cache` | kb_user | user-service | auth-adapter(读) |

**数据库用户与服务对应（在 `kb-infra/init-db/02_service_users.sql` 中定义）：**

| 服务 | DB 用户 |
|------|--------|
| ingest-service | `kb_ingest` |
| kb-doc-processor | `kb_processor` |
| vector-service | `kb_vector` |
| user-service | `kb_user_svc` |
| rag-service | `kb_rag`（只读） |

---

## Token 规范

- 所有对外接口：携带 OBO token（`aud=mcp-kb`，`exp=5min`）
- OBO token 必须包含的 claims：`tenant_id`, `uid`, `role_codes`, `dept_ids`, `sec_level`, `perm_group_ids`
- 禁止在 HTTP header 中传递 `X-User-Id`、`X-Tenant-Id`、`X-Roles` 等自定义用户字段
- 用户上下文只能从 OBO token 的 JWT claims 中解析

---

## MVP 一期禁止实现的功能

以下功能必须用 PHASE2 标注占位，**不允许在一期实现任何实质逻辑**：

- `OCRParser`（扫描件处理，依赖 Tesseract+EasyOCR）
- `SemanticChunker`（按标题/段落边界切分，一期用 FixedLengthChunker）
- `PIIFilter`（PII 脱敏，涉及合规评审）
- BM25 混合检索（依赖 Elasticsearch）
- `search-service`（独立搜索服务，架构图中标注"二期启用"）
- OPA 策略引擎（ABAC 细粒度权限）
- 多模型路由（embedding 多模型选择）
- 数据归档（`knowledge_doc_archive` 表）

**一期 MVP 限制（所有入口必须校验）：**
```yaml
mvp_limits:
  max_file_pages: 30
  max_file_size_mb: 5
  ocr_disabled: true
  embedding_batch_size: 32
  processor_replicas: 3
  max_retry: 3
```

**PHASE2 标注规范：**
- Java：`@Phase2Feature` 注解 + 构造方法中 `throw new UnsupportedOperationException("PHASE2_PLACEHOLDER: ...")`
- Python：`# PHASE2:` 注释块 + `__init__` 中 `raise NotImplementedError("PHASE2_PLACEHOLDER: ...")`
- 配置文件：`enabled: false  # PHASE2: ...`

---

## trace_id 规范

- 所有服务入口必须生成或传递 `trace_id`
- 格式：`tr-{uuid4}`（如 `tr-a1b2c3d4-e5f6-...`）
- 所有结构化日志必须包含 `trace_id` 字段
- 全链路：前端 → gateway → ingest → Kafka → processor → Kafka → vector → Milvus
- 所有拒答响应必须携带 `trace_id`（供管理员审计）

---

## 接口契约先行

实现代码之前，对应的契约文件必须存在：
- REST 接口：`contracts/openapi/` 中有对应的 YAML
- Kafka 消息：`contracts/kafka-schemas/` 中有对应的 JSON Schema
- Milvus Collection：`contracts/milvus/` 中有定义脚本

**发现契约与实现不一致时，以契约为准，修改实现代码。**

---

## doc/ 文档管理规范

项目所有开发文档存放在 `doc/` 目录，结构如下：

```
doc/
├── FEATURES.md          ← 功能进度总览（✅已完成 / 🔄进行中 / 📋计划中 / ⏸暂缓）
│                           每完成一个功能必须更新对应条目状态
├── CURRENT_SESSION.md   ← 会话问题追踪（append-only）
│                           每次新会话追加一条记录；问题解决后标记 [结束]
├── adr/                 ← 架构决策记录（Architecture Decision Records）
│                           重要技术决策必须在此留档，格式：ADR-NNN-标题.md
├── api/                 ← 接口使用说明（面向调用方，比 OpenAPI 更易读）
├── ops/                 ← 运维操作手册（部署、扩容、回滚、告警处理流程）
└── design/              ← 设计文档（数据流图、状态机、关键算法说明）
```

**使用规则：**
1. 完成任意功能后，立即更新 `doc/FEATURES.md` 对应条目为 `✅ 已完成`
2. 每次新会话开始时，在 `CURRENT_SESSION.md` 追加一条 `[进行中]` 记录
3. 会话问题解决后，将记录状态改为 `[结束]` 并填写结束时间
4. 重要架构决策（技术选型、方案取舍）必须写 ADR 留档

---

## Karpathy Guidelines

行为准则，减少 LLM 编程错误。**权衡：** 偏向谨慎而非速度，简单任务自行判断。

### 1. Think Before Coding

**不要假设，不要隐藏困惑，暴露权衡。**

实现前：

- 明确陈述假设，不确定时提问
- 存在多种解释时，列出它们而不是默默选择
- 存在更简单方案时说出来，该反驳时反驳
- 有不清楚的地方就停下来，指出困惑所在并提问
- 要求用中文回复我

### 1.5 Complex Feature Confirmation

**复杂功能必须先确认再开发，避免返工。**

当遇到以下情况时，必须先进入 Plan Mode 与用户确认方案：
- 单个功能涉及 3 个及以上文件的修改
- 需要新增数据库表或 Kafka Topic
- 涉及多服务间的交互设计
- 架构决策（如新建 Service、新增依赖）
- 不确定需求能否实现或有多种实现路径时

确认内容包括：实现方案、数据流、文件列表、边界条件。确认通过后再开始编码。

### 2. Simplicity First

**最少代码解决问题，不做投机性代码。**

- 不添加需求之外的功能
- 不为一次性代码创建抽象
- 不添加未请求的"灵活性"或"可配置性"
- 不为不可能的场景添加错误处理
- 如果 200 行可以写成 50 行，重写

自问："高级工程师会说这过度复杂吗？"如果是，简化。

### 3. Surgical Changes

**只触碰必须改的，只清理自己的烂摊子。**

编辑现有代码时：

- 不"改进"相邻代码、注释或格式
- 不重构没坏的部分
- 匹配现有风格，即使你会有不同做法
- 发现无关死代码时提及，但不删除

你的修改造成孤儿代码时：

- 移除你修改造成的未使用导入/变量/函数
- 不移除已有的死代码，除非被要求

检验标准：每行修改都应该直接追溯到用户请求。

### 4. Goal-Driven Execution

**定义成功标准，循环验证直到完成。**

将任务转化为可验证目标：

- "添加验证" → "为无效输入写测试，然后让它们通过"
- "修复 bug" → "写一个复现它的测试，然后让测试通过"
- "重构 X" → "确保测试前后都通过"

多步任务时，列出简要计划：

```
1. [步骤] → 验证: [检查项]
2. [步骤] → 验证: [检查项]
3. [步骤] → 验证: [检查项]
```

强成功标准让你能独立循环，弱标准（"让它工作"）需要不断澄清。

---

## 可观测性规范

所有服务的结构化日志必须包含以下字段：
```json
{
  "trace_id": "tr-xxx",
  "tenant_id": "t1",
  "doc_id": "DOC123",
  "step": "parse|clean|chunk|embed|upsert",
  "duration_ms": 123,
  "status": "success|failed",
  "error_code": "可选，失败时填写"
}
```

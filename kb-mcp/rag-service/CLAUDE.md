# rag-service 开发规则

## 服务职责

接收用户查询 → Query 改写 → 向量检索（Milvus）→ Rerank 精排 → ACL 二次校验 → 构造 Prompt → 调 llm-gateway → 返回带引用的答案。

**Phase 2 新增：** 反馈闭环（点赞/点踩/报错）→ Badcase 自动归档 → 高频问题聚合分析 → LLM 答案自评置信度。

**不直接访问 MinIO，不做向量化。**

## 本服务拥有的数据库表

| 表 | Schema | 读写权限 |
|----|--------|---------|
| `rag_session` | kb_knowledge | CRUD |
| `rag_message` | kb_knowledge | CRUD |
| `rag_pipeline_trace` | kb_audit | INSERT / SELECT |
| `rag_feedback` | kb_audit | INSERT / SELECT / UPDATE |
| `badcase_archive` | kb_audit | INSERT / SELECT / UPDATE |

**只读权限：**
- `kb_knowledge.doc_acl`：ACL 二次校验
- `kb_knowledge.knowledge_version`：验证文档版本是否有效（status=READY）
- `kb_knowledge.knowledge_doc`：空间范围解析
- `kb_knowledge.knowledge_space`：空间子树查询

DB 用户：`kb_rag`

## 禁止的调用

- 禁止直接访问 MinIO（chunks 已在 Milvus 的 text 字段中）
- 禁止直接调用 embedding-service（向量化不在 rag 职责内）
- 禁止接受自定义用户头

## 允许调用的下游服务

| 下游 | 用途 |
|-----|------|
| Milvus | 向量检索 Top20 |
| embedding-service | Query 向量化（仅查询 query 时调用，不用于文档） |
| rerank-service（BGE-Reranker） | Top20 → Top5 精排 |
| llm-gateway | 生成答案 |
| user-service | 获取用户 perm_group_ids（若 OBO token 中不含） |

## ACL 过滤规则（Milvus filter，必须包含所有字段）

```
tenant_id == '{tenant_id}' AND
sec_level <= {user_sec_level} AND
perm_group_id in [{perm_group_ids}] AND
(effective_to is null OR effective_to > '{today}')
```

**禁止返回 effective_to 早于今天的内容（已过期文档）。**

## 检索流程（不允许跳步）

1. Query 改写（同义词扩展）
2. 关键词兜底（精确匹配条款编号/制度名称，如"第3.2.1条"）
3. Milvus 向量检索 Top20 + ACL 预过滤
4. BGE-Reranker 精排 Top20→Top5
5. ACL 二次校验（查 `doc_acl` 表）
6. 拒答判断
7. 构造 Prompt + 引用块（含置信度自评指令）
8. 调 llm-gateway → LLM 生成答案
9. 解析置信度标记 `[CONFIDENCE: HIGH/MEDIUM/LOW]`，从答案中剥离
10. 保存会话消息，返回 messageId + confidence

## 拒答逻辑（必须实现，不允许省略）

| 条件 | reason 字段 | 用户展示 |
|-----|------------|---------|
| 召回为空 | `NO_MATCH` | "知识库中暂时没有找到相关资料" |
| ACL 过滤后全部被拒 | `NO_PERMISSION` | "您没有权限查看相关内容" |
| 证据分低于阈值 | `LOW_CONFIDENCE` | "知识库中暂时没有找到相关资料" |

所有拒答必须返回 `traceId`。

## 反馈闭环（Phase 2 新增）

### 数据流

```
前端 👍/👎/🚩 → POST /rag/v1/feedback → FeedbackService
  → kb_audit.rag_feedback (持久化)
  → DISLIKE/REPORT → 自动归档 kb_audit.badcase_archive
```

### 反馈表结构

- **rag_feedback**: `trace_id` (UNIQUE), `tenant_id`, `uid`, `session_id`, `message_id`, `feedback_type` (LIKE/DISLIKE/REPORT), `report_reason` (HALLUCINATION/WRONG_CITATION/IRRELEVANT/OTHER), `comment`, `confidence`
- **badcase_archive**: 从 rag_pipeline_trace + rag_message 脱敏归档，包含 query/rewrittenQuery/answer/citations/trace_summary, `status` (OPEN/REVIEWED/RESOLVED/DISMISSED)

### 答案自评置信度

System Prompt 要求 LLM 在回答最后一行输出 `[CONFIDENCE: HIGH/MEDIUM/LOW]`。ChatServiceImpl 解析并剥离，写入 ChatResponse.confidence。前端 LOW 置信度时展示橙色警告条。

## 接口清单

| 接口 | 方法 | 路径 | 说明 |
|-----|------|-----|------|
| 问答检索 | POST | `/rag/v1/chat` | 同步 RAG 问答 |
| 流式问答 | POST | `/rag/v1/chat/stream` | SSE 流式 RAG 问答 |
| 会话列表 | GET | `/rag/v1/sessions` | 用户会话列表 |
| 创建会话 | POST | `/rag/v1/sessions` | 新建 RAG 会话 |
| 会话消息 | GET | `/rag/v1/sessions/{id}/messages` | 消息历史 |
| 删除会话 | DELETE | `/rag/v1/sessions/{id}` | 删除会话 |
| 链路追踪 | GET | `/rag/v1/traces/{traceId}` | Pipeline Trace 详情 |
| 提交反馈 | POST | `/rag/v1/feedback` | 点赞/点踩/报错 |
| 查询反馈 | GET | `/rag/v1/feedback/{traceId}` | 查询已有反馈 |
| Badcase 列表 | GET | `/rag/v1/badcases` | 筛选+分页查询 badcase |
| 高频问题 | GET | `/rag/v1/analytics/top-queries` | Top N 高频 query |

接口定义详见：`contracts/openapi/rag-service-v1.yaml`

## 检索缓存策略

```
cache_key = "kb:search:{tenant_id}:{hash(query)}:{sorted(perm_group_ids)}"
TTL = 10 分钟
```

**必须包含 perm_group_ids 在 cache key 中，防止权限泄露。**

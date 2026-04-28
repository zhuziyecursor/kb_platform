# rag-service 开发规则

## 服务职责

接收用户查询 → Query 改写 → 向量检索（Milvus）→ Rerank 精排 → ACL 二次校验 → 构造 Prompt → 调 llm-gateway → 返回带引用的答案。

**不直接访问 PostgreSQL，不直接访问 MinIO，不做向量化。**

## 本服务不拥有任何数据库表

rag-service **无写权限**，仅有以下只读权限：
- `kb_knowledge.doc_acl`：ACL 二次校验
- `kb_knowledge.knowledge_version`：验证文档版本是否有效（status=READY）

DB 用户：`kb_rag`（只读用户）

**严禁添加任何 JPA Repository 或 JDBC 写入逻辑。ArchUnit 测试会检测违规。**

## 禁止的调用

- 禁止直接访问 PostgreSQL（除 doc_acl / knowledge_version 的只读查询外）
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
7. 构造 Prompt + 引用块
8. 调 llm-gateway → LLM 生成答案

## 拒答逻辑（必须实现，不允许省略）

| 条件 | reason 字段 | 用户展示 |
|-----|------------|---------|
| 召回为空 | `NO_MATCH` | "知识库中暂时没有找到相关资料" |
| ACL 过滤后全部被拒 | `NO_PERMISSION` | "您没有权限查看相关内容" |
| 证据分低于阈值 | `LOW_CONFIDENCE` | "知识库中暂时没有找到相关资料" |

所有拒答必须返回 `traceId`。

## 接口清单（MVP 一期）

| 接口 | 方法 | 路径 | scope |
|-----|------|-----|-------|
| 问答检索 | POST | `/rag/v1/chat` | `kb:search` |

接口定义详见：`contracts/openapi/rag-service-v1.yaml`

## 检索缓存策略

```
cache_key = "kb:search:{tenant_id}:{hash(query)}:{sorted(perm_group_ids)}"
TTL = 10 分钟
```

**必须包含 perm_group_ids 在 cache key 中，防止权限泄露。**

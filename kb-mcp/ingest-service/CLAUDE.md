# ingest-service 开发规则

## 服务职责

提供文档入库接口（init-upload / commit / ingest / verify-upload / status），管理文档元数据和状态机，触发异步入库流水线。

**不处理文件内容，不解析文档，只管元数据和流水线触发。**

## 本服务拥有的表

| 表名 | 操作权限 | 说明 |
|------|---------|------|
| `kb_knowledge.knowledge_doc` | SELECT, INSERT, UPDATE | 主要写入，管理文档元数据和状态机 |
| `kb_knowledge.doc_acl` | SELECT, INSERT, UPDATE | commit 时写入 ACL |
| `kb_knowledge.knowledge_version` | SELECT, INSERT | **只能 INSERT**，UPDATE 由 vector-service 负责 |
| `kb_knowledge.knowledge_space` | SELECT, INSERT, UPDATE, DELETE | ⭐ 知识空间 CRUD |

## Space API（当前开发中）

| 接口 | 方法 | 路径 | scope |
|-----|------|-----|-------|
| 列表 | GET | `/kb/v1/spaces` | `kb:read` |
| 详情 | GET | `/kb/v1/spaces/{spaceId}` | `kb:read` |
| 创建 | POST | `/kb/v1/spaces` | `kb:write` |
| 更新 | PUT | `/kb/v1/spaces/{spaceId}` | `kb:write` |
| 删除 | DELETE | `/kb/v1/spaces/{spaceId}` | `kb:admin` |

## 禁止访问的表

- `kb_knowledge.knowledge_clean`（属于 kb-doc-processor）
- `kb_knowledge.knowledge_structured`（属于 kb-doc-processor）
- `kb_knowledge.embed_task`（属于 kb-doc-processor/vector-service）
- `kb_user.user_context_cache`（属于 user-service）

## 禁止的调用

- 禁止直接 HTTP 调用 kb-doc-processor（正常流程）→ 必须走 Kafka
- 禁止直接写入 Milvus
- 禁止调用 embedding-service
- 禁止修改 `knowledge_version.status`（PROCESSING→READY/FAILED 由 vector-service 负责）

## Kafka 生产规则

只向 `file-ingest` topic 发布消息，消息格式必须符合 `contracts/kafka-schemas/file-ingest-message.json`：

必填字段：`traceId, tenantId, docId, version, srcPath, sha256, secLevel, regionCode, bizDomain`
MVP 固定值：`pageLimit=30, ocrDisabled=true`

## 接口清单（MVP 一期）

| 接口 | 方法 | 路径 | scope |
|-----|------|-----|-------|
| 初始化上传 | POST | `/kb/v1/docs/init-upload` | `kb:upload` |
| 验证上传 | POST | `/kb/v1/docs/{docId}/verify-upload` | `kb:upload` |
| 提交入库 | POST | `/kb/v1/docs/{docId}/commit` | `kb:upload` |
| 触发入库 | POST | `/kb/v1/docs/{docId}/ingest` | `kb:upload` |
| 查询状态 | GET | `/kb/v1/docs/{docId}/status` | `kb:upload` |

接口定义详见：`contracts/openapi/ingest-service-v1.yaml`

## 状态机规则（ingest-service 负责的转换）

```
DRAFT   → PENDING    （commit 时创建 knowledge_version）
PENDING → PROCESSING （ingest 接口被调用时）
```

以下状态转换由 **vector-service** 负责，ingest-service 不触碰：
```
PROCESSING → READY
PROCESSING → FAILED
```

## 幂等检查

- init-upload：相同 `tenant_id + sha256` → 返回已有 `doc_id`，提示用户确认覆盖
- commit：相同 `doc_id + version` → 幂等，返回已有记录
- ingest：已是 PROCESSING/READY 状态 → 拒绝重复触发

## MinIO presigned URL 安全策略

```yaml
content_length_range: [1, 5242880]  # 1 ~ 5MB
eq: ["$Content-Type", "application/pdf"]
expiry: 300  # 5 分钟
```

## 文件大小校验（入口必须校验）

```java
if (request.getFileSize() > 5 * 1024 * 1024) {
    throw new FileSizeLimitException("文件大小不能超过 5MB（MVP 限制）");
}
```

# vector-service 开发规则

## 服务职责

消费 `embed-task` Kafka 消息 → 调用 embedding-service 向量化 → Milvus upsert → 更新文档状态为 READY。

**不做文件解析，不处理文本，只负责向量化和写入 Milvus。**

## 本服务拥有的表（更新权限）

| 表名 | 操作权限 | 说明 |
|------|---------|------|
| `kb_knowledge.knowledge_version` | SELECT, UPDATE | **只能 UPDATE status 字段**（PROCESSING→READY/FAILED） |
| `kb_knowledge.embed_task` | SELECT, UPDATE | 更新 status / milvus_pk / error_code |

**只读的表：**
| 表名 | 说明 |
|------|------|
| `kb_knowledge.knowledge_doc` | 读取文档元数据（sec_level, region_code 等） |

DB 用户：`kb_vector`

## 禁止的操作

- 禁止调用 kb-doc-processor（方向错误）
- 禁止解析文件或处理原始文本
- 禁止对 `knowledge_version` 执行 INSERT（只能 UPDATE）
- 禁止自行生成 embedding（必须调用 embedding-service）

## Kafka 消费规则

消费 `embed-task` topic，消息格式见 `contracts/kafka-schemas/embed-task-message.json`。

**批量处理：** `embedding_batch_size: 32`（MVP 限制）

消费失败处理：
- 更新 `embed_task.status=FAILED`，`retry_count+1`
- `retry_count < 3`：指数退避重试
- `retry_count >= 3`：标记 FAILED，写 dead_letter_queue，触发告警，等待人工介入

## 版本软下线流程（向量删除）

新版本 READY 后：
1. 将旧版本 `knowledge_version.status` → `OFFBOARDED`
2. 5 分钟后异步删除 Milvus 中 `doc_id + version` 对应的所有向量
3. `doc_acl` 旧版本记录保留（供审计追溯）

## embedding-service 调用规范

- HTTP POST 调用，不传递 `model` 参数（服务端固定 BGE-zh-v1.5）
- 向量维度：1024（BGE-zh-v1.5）
- 熔断配置：5xx 错误率 > 1% 触发熔断，写 dead_letter_queue

## Milvus 写入规范

Collection：`kb_documents`，字段定义见 `contracts/milvus/kb_documents_collection.py`

每条向量记录必须包含 ACL 预过滤字段：
`tenant_id, sec_level, perm_group_id, region_code, effective_to`

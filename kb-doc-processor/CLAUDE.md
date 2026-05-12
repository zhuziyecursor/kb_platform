# kb-doc-processor 开发规则

## 服务职责

消费 `file-ingest` Kafka 消息 → Parser → Cleaner → Chunker → 发布 `embed-task` 消息。
同时提供 HTTP API（`/api/v1/parse, /clean, /chunk, /process`）供调试和直接调用使用。

**负责文本处理（解析/清洗/切片）和当前实现中的文档 chunk embedding，不写 Milvus。**

## 本服务拥有的表

| 表名 | 操作权限 | 说明 |
|------|---------|------|
| `kb_knowledge.knowledge_clean` | SELECT, INSERT, UPDATE | 清洗结果 |
| `kb_knowledge.knowledge_structured` | SELECT, INSERT, UPDATE | 结构化结果 |
| `kb_knowledge.embed_task` | SELECT, INSERT | **只能 INSERT**，UPDATE 由 vector-service 负责 |

DB 用户：`kb_processor`（Python 通过 psycopg2/SQLAlchemy 连接）

## 禁止的操作

- 允许通过 `EmbeddingClient` 调用 embedding-service 生成文档 chunk 向量；禁止写 Milvus
- 禁止写入 Milvus（导入 `pymilvus` 会被 import 守护测试检测到）
- 禁止修改 `knowledge_doc` 或 `knowledge_version` 的状态
- 禁止修改 `embed_task.status` / `embed_task.milvus_pk`（这是 vector-service 的职责）
- 禁止导入 `torch`, `sentence_transformers`, `pymilvus`（import 守护测试会检测）

## MVP 一期使用的实现类

| 组件 | 一期使用 | 一期禁止（PHASE2） |
|-----|---------|----------------|
| Parser | `TikaParser` | `OCRParser` |
| Cleaner | `TextCleaner` | `PIIFilter` |
| Chunker | `FixedLengthChunker` / `SemanticChunker` / `LLMChunker` | 无（一期已实现全部三种分片器） |

## PHASE2 标注要求

`OCRParser`、`PIIFilter`、`SemanticChunker` 类保留骨架代码，但：
1. `__init__` 必须抛出 `NotImplementedError("PHASE2_PLACEHOLDER: ...")`
2. 类头部必须有 `# PHASE2:` 注释说明二期启用条件和依赖

## Kafka 消费规则

- 消费 `file-ingest` topic
- 消费失败时：更新 `embed_task.status=FAILED`，`retry_count+1`
- `retry_count >= max_retry(3)`：停止重试，等待人工介入

## Kafka 生产规则

- 向 `embed-task` topic 发布消息
- 消息格式必须符合 `contracts/kafka-schemas/embed-task-message.json`
- 每个 chunk 对应一条消息（不批量合并）
- 必填字段：`traceId, tenantId, docId, version, chunkSeq, text, textHash, secLevel, regionCode, bizDomain, permGroupId, aclVersion`

## HTTP API 接口（MVP 一期，供调试使用）

| 接口 | 方法 | 路径 |
|-----|------|-----|
| 解析文件 | POST | `/api/v1/parse` |
| 清洗文本 | POST | `/api/v1/clean` |
| 切片 | POST | `/api/v1/chunk` |
| 一体化处理 | POST | `/api/v1/process` |

接口定义详见：`contracts/openapi/doc-processor-v1.yaml`

**注意：这 4 个接口无对外鉴权要求（内部服务调用），但必须校验配置中的文件大小和页数限制。**

## Import 守护测试

`tests/conftest.py` 中必须有测试，验证以下库不被导入：
```python
FORBIDDEN_IMPORTS = ["pymilvus", "torch", "sentence_transformers"]
```

## 配置文件规范

```yaml
# config/settings.yaml
kb_document_processor:
  parsers:
    - name: TikaParser
      enabled: true
    - name: OCRParser
      enabled: false  # PHASE2: 二期启用

  cleaners:
    - name: TextCleaner
      enabled: true
    - name: PIIFilter
      enabled: false  # PHASE2: 合规评审后启用

  chunkers:
    - name: FixedLengthChunker
      enabled: true
      chunk_size: 512
      overlap_ratio: 0.1
    - name: SemanticChunker
      enabled: true  # 规则引擎智能分片
    - name: LLMChunker
      enabled: true  # LLM 精修层，依赖 MiniMax API
```

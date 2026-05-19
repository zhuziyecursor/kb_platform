# RAGFlow 入库链路改造方案（完整版）

## 目标

新增一个开关，开启后走 RAGFlow 线路，将 RAGFlow 的全部解析能力拉回 kb-platform，写入现有 PG + Milvus。关闭时走现有本地线路，两套线路互不干扰。

核心原则：**RAGFlow 负责"理解"，kb-platform 负责"存储"** — RAGFlow 解析出来的所有结果（切片、向量、知识图谱、元数据、标签、语义类型、摘要）全部落库到 kb-platform，后续检索/问答由 kb-platform 自己的 Milvus + rag-service 完成。

## RAGFlow → kb-platform 数据映射全景

```
RAGFlow 输出                         kb-platform 存储目标
─────────────────────────────────────────────────────────
文档解析 (PDF/DOCX/...)      →      knowledge_clean.cleaned_text
智能切片 (12 种策略)         →      embed_task (每个 chunk 一行)
向量嵌入 (dim=1024)          →      embed-task Kafka → Milvus
元数据提取 (标题/作者/日期)   →      knowledge_clean.meta_json + knowledge_doc
标签提取                     →      knowledge_doc.label_tags + embed_task.tags
语义分类 (定义/流程/规则)     →      embed_task.chunk_type
关键词提取                   →      embed_task.keywords
摘要生成                     →      embed_task.summary
知识图谱 (实体+关系)          →      knowledge_structured.json_body.knowledge_graph
```

## 开关层级：总开关 + 子开关

```
ragflow.enabled (总开关，default: false)
  │
  ├── OFF → 走现有本地 Tika 线路（零改动，RAGFlow 完全不接触）
  │
  └── ON  → 走 RAGFlow 线路，子开关控制各能力：
       ├── pull_metadata: true/false     # 文档元数据
       ├── pull_tags: true/false         # 标签提取
       ├── pull_knowledge_graph: true/false  # 知识图谱
       ├── pull_keywords: true/false     # 关键词
       └── pull_summary: true/false      # 摘要
```

**总开关关闭 → 整条 RAGFlow 链路不触发，无缝回退到本地管线。** 子开关只在总开关开启时生效，实现精细控制。

## 核心设计：在 kb-doc-processor 内分支

```
kb-doc-processor 消费 file-ingest 消息
  │
  ├── ragflowEnabled = false (默认) → 现有 Pipeline（零改动）
  │
  └── ragflowEnabled = true  → RagflowPipeline（新增）
       1. 上传文件到 RAGFlow Dataset（配置 auto_metadata + use_kg=true）
       2. 触发解析 + 轮询等待完成
       3. if pull_metadata: 拉取文档元数据 → 映射到 knowledge_clean.meta_json
       4. 拉取 chunks（含 embedding）→ 映射到 ChunkResult
       5. if pull_keywords: 用 RAGFlow keywords，否则 jieba TF-IDF 兜底
       6. if pull_summary: 用 RAGFlow 摘要，否则 TextRank/LLM 兜底
       7. if pull_knowledge_graph: 拉取 KG → knowledge_structured.json_body
       8. if pull_tags: 合并 RAGFlow 标签到 label_tags + embed_task.tags
       9. 写入 knowledge_clean / knowledge_structured / embed_task
      10. 发布 embed-task Kafka 消息
```

**关键**：第 9-10 步的输出格式与现有 Pipeline 完全一致，因此 **vector-service 不需要任何改动**。

## 改动范围

| 组件 | 改动量 | 说明 |
|------|--------|------|
| PostgreSQL | 2 列新增 | `knowledge_space` 加 `ragflow_enabled` + `ragflow_dataset_id` |
| `file-ingest` Kafka 契约 | 1 字段新增 | `ragflowEnabled` |
| ingest-service | ~20 行 | 读取开关，传入 Kafka 消息 |
| kb-doc-processor 配置 | ~15 行 | RAGFlow 连接信息 + 功能开关 |
| kb-doc-processor 新建 | 1 个 | `ragflow_pipeline.py`（~300 行） |
| kb-doc-processor 改动 | ~10 行 | `pipeline.py` 分支逻辑 |
| vector-service | **不改** | |
| rag-service | **不改** | |
| kb-portal | **不改** | |
| dependencies | 1 个 | `ragflow-sdk>=0.25.0` |

## 详细实施步骤

### Step 1: 数据库 migration

**新建** `kb-infra/init-db/updates/026_ragflow_integration.sql`:

```sql
ALTER TABLE kb_knowledge.knowledge_space
  ADD COLUMN IF NOT EXISTS ragflow_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ragflow_dataset_id VARCHAR(128);
```

### Step 2: file-ingest Kafka 契约新增字段

**修改** `contracts/kafka-schemas/file-ingest-message.json`:

在 `properties` 中新增:
```json
"ragflowEnabled": {
  "type": "boolean",
  "default": false,
  "description": "是否使用 RAGFlow 线路处理。默认 false，走本地 Tika 线路"
}
```

同时将 `additionalProperties` 从 `false` 改为 `true`。

### Step 3: ingest-service 传入开关

**修改** `kb-mcp/ingest-service/src/main/java/com/kb/ingest/service/DocServiceImpl.java`:
- `ingest()` 方法中查询 `knowledge_space.ragflow_enabled`
- 构建 Kafka 消息时传入 `ragflowEnabled` 字段

**修改** `kb-mcp/ingest-service/src/main/java/com/kb/ingest/entity/KnowledgeSpace.java`:
- 新增 `ragflowEnabled` (Boolean) 和 `ragflowDatasetId` (String) 字段

### Step 4: kb-doc-processor 配置

**修改** `kb-doc-processor/config/settings.yaml`，新增:

```yaml
ragflow:
  # ── 总开关 ──
  # true: 走 RAGFlow 线路（子开关控制各能力）
  # false: 整条 RAGFlow 链路不触发，无缝回退本地 Tika 管线
  enabled: ${KB_RAGFLOW_ENABLED:false}

  # ── 连接配置 ──
  api_key: "${KB_RAGFLOW_API_KEY:}"
  base_url: "${KB_RAGFLOW_BASE_URL:http://localhost:9380}"

  # ── 解析配置 ──
  embedding_model: "${KB_RAGFLOW_EMBEDDING_MODEL:BAAI/bge-large-zh-v1.5}"
  chunk_method: "${KB_RAGFLOW_CHUNK_METHOD:naive}"
  parse_timeout_seconds: ${KB_RAGFLOW_PARSE_TIMEOUT:600}
  poll_interval_seconds: ${KB_RAGFLOW_POLL_INTERVAL:5}

  # ── 子开关（仅在 enabled=true 时生效） ──
  pull_metadata: ${KB_RAGFLOW_PULL_METADATA:true}       # 文档元数据
  pull_tags: ${KB_RAGFLOW_PULL_TAGS:true}               # 标签
  pull_knowledge_graph: ${KB_RAGFLOW_PULL_KG:true}      # 知识图谱
  pull_keywords: ${KB_RAGFLOW_PULL_KEYWORDS:true}       # 关键词（关闭时 jieba TF-IDF 兜底）
  pull_summary: ${KB_RAGFLOW_PULL_SUMMARY:true}         # 摘要（关闭时 TextRank 兜底）

  # ── 降级配置 ──
  fallback_on_failure: ${KB_RAGFLOW_FALLBACK_ON_FAILURE:true}
```

**修改** `kb-doc-processor/src/config.py`，新增 `RagflowConfig`:

```python
class RagflowConfig(BaseModel):
    # ── 总开关 ──
    enabled: bool = False

    # ── 连接 ──
    api_key: str = ""
    base_url: str = "http://localhost:9380"

    # ── 解析 ──
    embedding_model: str = "BAAI/bge-large-zh-v1.5"
    chunk_method: str = "naive"
    parse_timeout_seconds: int = 600
    poll_interval_seconds: int = 5

    # ── 子开关 ──
    pull_metadata: bool = True
    pull_tags: bool = True
    pull_knowledge_graph: bool = True
    pull_keywords: bool = True
    pull_summary: bool = True

    # ── 降级 ──
    fallback_on_failure: bool = True
```

### Step 5: Kafka 消息模型适配

**修改** `kb-doc-processor/src/kafka_producer.py`:
- `FileIngestMessage` 新增 `ragflow_enabled: bool = False`

### Step 6: 核心 — RagflowPipeline 新建

**新建** `kb-doc-processor/src/ragflow_pipeline.py`:

#### 6.1 主流程

```python
class RagflowPipeline:
    def __init__(self, config, producer):
        ...

    def process_message(self, msg: FileIngestMessage):
        # 1. 从 MinIO 下载文件
        # 2. 懒创建/获取 RAGFlow dataset → 回写 knowledge_space.ragflow_dataset_id
        # 3. 上传文档到 RAGFlow → 触发解析（auto_metadata=true, use_kg=true）
        # 4. 轮询直到解析完成
        # 5. 拉取文档元数据 → 映射到 knowledge_clean.meta_json
        # 6. 拉取 chunks → 映射到 ChunkResult（含 vector, keywords, chunk_type）
        # 7. 拉取知识图谱 → 映射到 knowledge_structured.json_body
        # 8. 写入 PG: knowledge_clean + knowledge_structured + embed_task
        # 9. 发布 embed-task Kafka 消息
```

#### 6.2 各能力的具体映射

**A. 文档元数据（RAGFlow auto_metadata → knowledge_clean.meta_json）**

RAGFlow 在解析阶段通过 `auto_metadata=true` 自动提取文档级元数据。拉回后写入 `knowledge_clean.meta_json`:

```python
# RAGFlow 返回的文档级数据 → meta_json
meta_json = {
    "title": ragflow_doc.get("name", ""),          # 文档标题
    "author": ragflow_meta.get("author", ""),      # 作者（如 RAGFlow 提取到）
    "pageCount": ragflow_doc.get("page_count", 0), # 页数
    "parseMethod": "RAGFLOW_MINERU",               # 标记解析器
    "language": ragflow_meta.get("language", "zh"),
    "ragflow_doc_id": ragflow_doc["id"],           # RAGFlow 文档 ID（溯源）
    "ragflow_dataset_id": dataset_id,              # RAGFlow 知识库 ID（溯源）
}
```

**B. 标签提取（RAGFlow tags → knowledge_doc.label_tags + embed_task.tags）**

RAGFlow 可以从文档内容中自动提取标签。拉回后：
- 文档级标签合并入 `knowledge_doc.label_tags`
- 切片级标签写入 `embed_task.tags`

```python
# RAGFlow 文档标签 → 合并到 label_tags
ragflow_tags = ragflow_meta.get("tags", [])
enriched_tags = merge_tags(msg.label_tags, ragflow_tags)
# 向下传递到每个 embed_task.tags
```

**C. 语义分类（RAGFlow chunk 语义类型 → embed_task.chunk_type）**

RAGFlow 的 chunker 根据文档结构自动识别 chunk 的语义角色。映射关系：

| RAGFlow 分段角色 | kb-platform chunk_type |
|---|---|
| 正文段落 | `""` (未分类) |
| 标题/章节标题 | `"definition"` (结构定义) |
| 列表项/步骤 | `"procedure"` |
| 表格单元格 | 保留 `""` 或 `"example"` |
| 图片说明 | `"example"` |
| 公式 | `""` |

同时保留 kb-platform 现有的正则推断 `_infer_chunk_type(text)` 作为补充——如果 RAGFlow 未给出明确分类，则用正则兜底。

**D. 关键词提取（RAGFlow important_keywords → embed_task.keywords）**

RAGFlow 每个 chunk 可以携带 `important_keywords` 数组：

```python
# RAGFlow chunk.important_keywords → embed_task.keywords
keywords = " ".join(chunk.get("important_keywords", []))
# 如果 RAGFlow 未返回关键词，则用现有 jieba TF-IDF 兜底
```

**E. 摘要生成（RAGFlow 摘要 → embed_task.summary）**

RAGFlow 可以在 chunk 级别生成摘要文本：

```python
# RAGFlow 如果有摘要字段
summary = chunk.get("summary", "") or chunk.get("description", "")
# 未返回时用现有 TextRank/LLM 兜底
```

**F. 知识图谱（RAGFlow KG → knowledge_structured.json_body）**

RAGFlow 解析时设置 `use_kg=true`，解析完成后通过 `GET /api/v1/datasets/{id}/graph` 获取知识图谱数据。典型返回格式：

```json
{
  "entities": [
    {"name": "内部审计", "type": "概念", "description": "..."},
    {"name": "审计委员会", "type": "组织机构", "description": "..."}
  ],
  "relations": [
    {"source": "审计委员会", "target": "内部审计", "type": "监管"},
    {"source": "内部审计", "target": "风险评估", "type": "执行"}
  ]
}
```

写入 `knowledge_structured.json_body` 的 `knowledge_graph` 字段：

```python
structured_body = {
    "sections": [...],          # 切片层级（与现有格式兼容）
    "knowledge_graph": {        # 新增：知识图谱
        "entities": [...],
        "relations": [...],
        "source": "RAGFLOW",
    },
    "traceId": msg.trace_id,
}
```

**G. 向量嵌入（RAGFlow chunk embedding → embed-task Kafka vector）**

```python
# RAGFlow 侧必须配置 dim=1024 的 embedding model
vector = chunk["embedding"]  # list[float], len=1024
```

#### 6.3 RAGFlow Dataset 映射策略

- 1 个 `knowledge_space` ↔ 1 个 RAGFlow dataset
- 首次上传时懒创建 dataset，将其 ID 回写到 `knowledge_space.ragflow_dataset_id`
- 后续文档直接上传到已有 dataset
- Dataset 配置：
  ```python
  ds = rag.create_dataset(
      name=f"kb-{tenant_id}-{space_id}",
      embedding_model="BAAI/bge-large-zh-v1.5",  # dim=1024
      chunk_method=config.ragflow.chunk_method,    # 默认 "naive"
  )
  ```

#### 6.4 data/knowledge_structured 兼容性

`knowledge_structured.json_body` 的现有结构保持不变，新增 `knowledge_graph` 字段是可选的（`knowledge_graph` 为 null 时表示未启用 KG 或 KG 数据为空）。现有读取 `json_body.sections` 的代码不受影响。

### Step 7: Pipeline 分支

**修改** `kb-doc-processor/src/pipeline.py`:

```python
class Pipeline:
    def __init__(self, config, producer):
        # ... 现有初始化不变 ...
        self._ragflow = None
        # 总开关 + API Key 两者都就绪才初始化 RAGFlow
        if config.ragflow.enabled and config.ragflow.api_key:
            self._ragflow = RagflowPipeline(config, producer)

    def process_message(self, msg: FileIngestMessage):
        # 总开关 = 消息开关 + 本地配置开关，两者同时为 true 才走 RAGFlow
        if msg.ragflow_enabled and self._ragflow:
            try:
                return self._ragflow.process_message(msg)
            except Exception as exc:
                logger.error(f"RAGFlow pipeline failed: {exc}")
                if self._config.ragflow.fallback_on_failure:
                    logger.info("Falling back to local Tika pipeline")
                else:
                    raise
        # 总开关关闭 → 走现有 Tika 线路（完全不变）
        ...
```

## RAGFlow 开关总览

| 层级 | 开关 | 默认值 | 位置 | 作用 |
|------|------|--------|------|------|
| **总开关** | `ragflow.enabled` | `false` | `settings.yaml` | 控制是否走 RAGFlow 线路，关闭时无缝回退本地管线 |
| **总开关** | `knowledge_space.ragflow_enabled` | `false` | PostgreSQL | 按知识空间粒度控制，通过 Kafka 消息传递 |
| 子开关 | `pull_metadata` | `true` | `settings.yaml` | 文档元数据写入 meta_json，关闭时用文件名+Tika 基本信息 |
| 子开关 | `pull_tags` | `true` | `settings.yaml` | 标签合并到 label_tags/tags，关闭时只用 kb-platform 手动标签 |
| 子开关 | `pull_knowledge_graph` | `true` | `settings.yaml` | 知识图谱写入 json_body，关闭时 json_body 无 knowledge_graph |
| 子开关 | `pull_keywords` | `true` | `settings.yaml` | 关键词写入 embed_task.keywords，关闭时 jieba TF-IDF 兜底 |
| 子开关 | `pull_summary` | `true` | `settings.yaml` | 摘要写入 embed_task.summary，关闭时 TextRank 兜底 |

**生效逻辑**：`ragflow.enabled=true` AND `knowledge_space.ragflow_enabled=true` → 走 RAGFlow 线路，子开关控制各能力；任一总开关为 false → 走本地 Tika 管线。

## 向量维度严格约束

当前 Milvus collection + Kafka 契约硬编码 **dim=1024**。RAGFlow 中必须配置输出 1024 维的 embedding model，默认使用 `BAAI/bge-large-zh-v1.5`（与 kb-platform 现有 `BGE-zh-v1.5` 兼容）。

## 不在本次范围内

- rag-service 的检索/问答改造（本次只做入库链路）
- knowledge_space 管理界面新增 RAGFlow 开关的 UI
- RAGFlow 的部署和运维配置
- RAGFlow 生成的 `questions`（chunk 级推荐问题）— 当前 kb-platform schema 无对应字段，后续可按需新增

## 验证清单

1. **总开关关闭**：`knowledge_space.ragflow_enabled=false` → 上传文档，走 Tika 线路，所有现有功能不受影响
2. **配置总开关关闭**：`ragflow.enabled=false` → 即使 `knowledge_space.ragflow_enabled=true`，RagflowPipeline 也不初始化，走 Tika
3. **两个总开关都开启** + RAGFlow 可用 → 上传文档：
   - `knowledge_clean` 有完整全文 + meta_json 含 RAGFlow 元数据
   - `knowledge_structured` 有切片层级 + knowledge_graph（实体/关系）
   - `embed_task` 每个 chunk 有 keywords, summary, chunk_type, tags
   - `embed-task` Kafka 消息被 vector-service 正常消费
   - `knowledge_search_idx` 有 BM25 索引
   - Milvus 中可检索到文档
4. **子开关关闭**：`pull_knowledge_graph=false` → `json_body.knowledge_graph` 为 null；`pull_keywords=false` → keywords 用 jieba 兜底
5. **RAGFlow 不可用 + `fallback_on_failure=true`** → 自动降级到 Tika 线路
6. **RAGFlow 不可用 + `fallback_on_failure=false`** → 文档标记 FAILED
7. 嵌入维度不匹配 → embed_task 标记 FAILED，错误信息清晰

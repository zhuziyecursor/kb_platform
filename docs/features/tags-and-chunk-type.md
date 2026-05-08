# tags + chunk_type 字段实现方案

> 状态：📋 计划中 | 版本：v1.0 | 2026-05-06

## 设计动机

当前 `kb_documents` Collection 的检索依据只有 `vector + text + ACL`，缺少两个关键维度：

| 缺失维度 | 问题 | 后果 |
|----------|------|------|
| **标签维度** | 用户无法按业务标签过滤 | 所有检索返回全量结果，无法限定"只看合规相关"、"只看 2026 年" |
| **语义维度** | 向量仅捕捉词汇相似度 | 两段完全不相关的文本因词汇重叠得高分（如"财务报表" vs "Bug 报表"） |

---

## 方案设计

### 新增字段

| 字段 | Milvus 类型 | 优先级 | 检索用途 |
|------|------------|--------|---------|
| `tags` | `VARCHAR(512)` | **MVP** | 继承展平标签，逗号分隔，最多 9 个（文档 3 + 章节 3 + 分片 3） |
| `chunk_type` | `VARCHAR(32)` | **MVP** | 段落语义类型，补偿纯向量检索的语义盲区 |
| `keywords` | `VARCHAR(256)` | 二期 | 关键词（空格分隔），由 chunker 自动提取，支持 BM25 混合检索 |
| `summary` | `VARCHAR(256)` | 三期 | LLM 单句摘要，rerank 时 `query vs summary` 比 `query vs 原文` 更准 |

### 标签继承展平（写时解析）

```
文档标签:  ["合规", "金融", "2026"]
  └─ 章节标签: ["反洗钱", "KYC"]
       └─ 分片标签: ["大额交易", "报告义务"]
            → 最终存入 tags: "合规,金融,2026,反洗钱,KYC,大额交易,报告义务"
```

继承在入库时一次性展平到 `tags` 字段，检索只需一行 filter：

```
tags like "%合规%" AND tags like "%反洗钱%"
```

比存三层分别查询简单，也不会加重 Milvus 查询负担。

### chunk_type 语义区分

| 类型 | 说明 | 适用场景 |
|------|------|---------|
| `definition` | 概念定义 | "什么是反洗钱" |
| `procedure` | 操作步骤 | "怎么提交大额交易报告" |
| `rule` | 规定/条款 | "反洗钱法第几条" |
| `example` | 案例/示例 | 过往处罚案例 |
| `disclaimer` | 免责声明 | 低信息量，rerank 降权 |

**chunk_type 推断规则**（基于正则，在 kb-doc-processor pipeline 中执行）：

| 正则模式 | 匹配的 chunk_type |
|----------|------------------|
| `定义\|是指\|指的是\|指一种\|意为\|即` | `definition` |
| `步骤\|流程\|操作\|点击\|输入\|执行\|运行\|构建\|部署\|安装\|配置` | `procedure` |
| `如何\|怎么做\|怎样\|怎么` | `procedure` |
| `第.*条\|第.*章\|规定\|必须\|禁止\|不得\|应当\|应` | `rule` |
| `例如\|示例\|举例\|比如\|案例` | `example` |
| `免责\|不承担\|不保证\|风险提示\|注意` | `disclaimer` |

按优先级顺序匹配，命中即停。未命中返回空字符串。

---

## 改动范围

```
contracts/
├── milvus/kb_documents_collection.py          ← 新增字段定义       [✅ 已完成]
└── kafka-schemas/embed-task-message.json       ← 新增 tags + chunkType

kb-doc-processor/src/
├── kafka_producer.py                           ← EmbedTaskMessage 加字段
└── pipeline.py                                 ← chunk_type 推断 + tags 传递

kb-mcp/vector-service/src/main/java/.../
├── dto/EmbedTaskMessage.java                   ← 加 @JsonProperty
└── service/MilvusService.java                  ← upsert 列扩展

kb-mcp/rag-service/src/main/java/.../
├── dto/MilvusSearchResult.java                 ← 加 tags + chunkType
└── service/MilvusSearchService.java            ← OUTPUT_FIELDS + filter + 加权

kb-mcp/ingest-service/src/main/java/.../
└── service/DocServiceImpl.java                 ← file-ingest 消息加 labelTags
```

---

## 实现详细

### Step 1：Kafka 契约更新

`contracts/kafka-schemas/embed-task-message.json` 的 `properties` 中新增：

```json
"tags": {
  "type": "string",
  "maxLength": 512,
  "description": "继承展平标签，逗号分隔，最多 9 个（文档 3 + 章节 3 + 分片 3）",
  "example": "合规,金融,2026,反洗钱,KYC,大额交易"
},
"chunkType": {
  "type": "string",
  "enum": ["definition", "procedure", "rule", "example", "disclaimer", ""],
  "description": "段落语义类型，空字符串表示未分类",
  "default": ""
}
```

> 注意：`additionalProperties: false` 需要改为 `true` 以支持渐进式 schema 演进，或者显式加入所有新字段。

### Step 2：processor — 数据产出端

**`kafka_producer.py`** — `EmbedTaskMessage` dataclass 加两个字段：

```python
@dataclass
class EmbedTaskMessage:
    # ... 现有字段 ...
    tags: str = ""           # 展平标签，逗号分隔
    chunk_type: str = ""     # 语义类型

    def to_dict(self) -> dict:
        data = {
            # ... 现有键 ...
            "tags": self.tags,
            "chunkType": self.chunk_type,
        }
        # ...
```

**`kafka_producer.py`** — `FileIngestMessage` dataclass 加 `label_tags`：

```python
@dataclass
class FileIngestMessage:
    # ... 现有字段 ...
    label_tags: str = ""     # 从 ingest-service InitUploadRequest 传入的文档级标签

    @classmethod
    def from_dict(cls, data: dict) -> "FileIngestMessage":
        return cls(
            # ...
            label_tags=data.get("labelTags", ""),
        )
```

**`pipeline.py`** — 新增 `_infer_chunk_type()` 方法：

```python
import re

CHUNK_TYPE_RULES = [
    (r"定义|是指|指的是|指一种|意为|即", "definition"),
    (r"步骤|流程|操作|点击|输入|执行|运行|构建|部署|安装|配置", "procedure"),
    (r"如何|怎么做|怎样|怎么", "procedure"),
    (r"第.*条|第.*章|规定|必须|禁止|不得|应当|应", "rule"),
    (r"例如|示例|举例|比如|案例", "example"),
    (r"免责|不承担|不保证|风险提示|注意", "disclaimer"),
]

def _infer_chunk_type(self, text: str) -> str:
    for pattern, ctype in CHUNK_TYPE_RULES:
        if re.search(pattern, text):
            return ctype
    return ""
```

**`pipeline.py`** — `_save_results()` 和 `_publish_embed_tasks()` 传入新参数：

```python
# _save_results() 中 embed_task 构造加：
tags=msg.label_tags,                    # 一期直接用文档级标签
# PHASE2: 合并章节/分片标签展平

# _publish_embed_tasks() 中 EmbedTaskMessage 构造加：
tags=msg.label_tags,
chunk_type=self._infer_chunk_type(chunk.text),
```

### Step 3：vector-service — Milvus 写入端

**`dto/EmbedTaskMessage.java`**：

```java
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class EmbedTaskMessage {
    // ... 现有字段 ...

    @JsonProperty("tags")
    private String tags;

    @JsonProperty("chunkType")
    private String chunkType;
}
```

**`service/MilvusService.java`** — `upsert()` 方法扩展：

```java
// 新增列 list
List<String> tagsList = new ArrayList<>();
List<String> chunkTypeList = new ArrayList<>();

// for 循环中取值
tagsList.add(m.getTags() != null ? m.getTags() : "");
chunkTypeList.add(m.getChunkType() != null ? m.getChunkType() : "");

// fields 追加
fields.add(new InsertParam.Field("tags", tagsList));
fields.add(new InsertParam.Field("chunk_type", chunkTypeList));
```

### Step 4：rag-service — 检索端

**`dto/MilvusSearchResult.java`**：

```java
private String tags;
private String chunkType;
```

**`service/MilvusSearchService.java`** — 三处改动：

```java
// 1. OUTPUT_FIELDS 追加
private static final List<String> OUTPUT_FIELDS = List.of(
    "doc_id", "version", "chunk_seq", "text", "title",
    "section_path", "page", "sec_level", "region_code", "biz_domain",
    "perm_group_id", "effective_from", "effective_to",
    "tags", "chunk_type"  // ← 新增
);

// 2. search() 中 row 解析追加
.tags(getStrField(row, "tags"))
.chunkType(getStrField(row, "chunk_type"))

// 3. 新增 chunk_type 加权（在 Milvus score 基础上微调）
private static final Map<String, Double> CHUNK_TYPE_BOOST = Map.of(
    "definition",  0.05,
    "rule",        0.03,
    "procedure",   0.01,
    "example",     0.00,
    "disclaimer", -0.03
);

// 在 filterByAcl() 之后、rerank 之前调用
public List<MilvusSearchResult> boostByChunkType(List<MilvusSearchResult> results) {
    for (MilvusSearchResult r : results) {
        double boost = CHUNK_TYPE_BOOST.getOrDefault(r.getChunkType(), 0.0);
        r.setVectorScore(r.getVectorScore() + boost);
    }
    return results;
}
```

### Step 5：Milvus Schema 迁移

对已存在的 `kb_documents` Collection 增量添加字段（幂等执行）：

```bash
python -c "
from pymilvus import connections, Collection, FieldSchema, DataType

connections.connect('default', host='localhost', port='19530')
col = Collection('kb_documents')

# 幂等：已存在的字段添加会报错，忽略即可
try:
    col.add_field(FieldSchema(name='tags', dtype=DataType.VARCHAR, max_length=512))
except Exception:
    pass

try:
    col.add_field(FieldSchema(name='chunk_type', dtype=DataType.VARCHAR, max_length=32))
except Exception:
    pass

# 建索引
col.create_index(field_name='tags', index_params={'index_type': 'INVERTED'})
col.load()
print('Migration done')
"
```

> 已有数据的两字段为空字符串，检索时不受影响（like 匹配不到任何内容，chunk_type boost 为 0）。

---

## PR 拆分建议

| PR | 范围 | 文件数 | 说明 |
|----|------|--------|------|
| PR1 | 契约 + processor | 3 | 上游数据产出端，改动最小，可独立测试 |
| PR2 | vector-service | 2 | Milvus 写入适配，依赖 PR1 的 schema migration |
| PR3 | rag-service | 2 | 检索侧消费 tags/chunkType，filter + 加权 |
| 独立 | schema migration | - | 运维一次性执行，幂等 |

---

## 检索增强效果预期

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 用户问"什么是反洗钱" | 召回操作步骤和免责声明 | `definition` 类型加权 +0.05，排前面 |
| 用户问"怎么做KYC" | 混合返回定义和流程 | `procedure` 类型优先 |
| 用户搜"大额交易" | 全业务域返回 | 加 `tags like "%大额交易%"` 精确过滤 |
| 用户限定合规标签 | 无法过滤 | `tags like "%合规%"` 只返回合规文档 |

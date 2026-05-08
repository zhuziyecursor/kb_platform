# 智能分片解决方案

> 两层渐进式架构：规则引擎语义切分 + MiniMax 大模型精修，替换当前 FixedLengthChunker 的机械计数式切分。

---

## 1. 背景与问题

### 当前状态

一期使用 `FixedLengthChunker`（[src/chunker/fixed_length_chunker.py](kb-doc-processor/src/chunker/fixed_length_chunker.py)），三种模式均是逐字符计数切分：

| 模式 | 行为 |
|------|-----|
| `HEAD_FIRST` | 从前往后，每 512 字符一段，10% 重叠 |
| `TAIL_FIRST` | 从后往前 |
| `UNIFORM` | 全文均分 |

**缺陷**：不感知段落、标题、章节边界。一段话被拦腰截断，检索时丢失上下文。

### 目标

实现两层的渐进式智能分片：
1. **第一层**：规则引擎识别章节/段落结构，在语义边界处切分
2. **第二层**：LLM 精修规则引擎无法处理的边界情况

两层都保证**原文精确性**——只切不写，chunk 内容完全来自原文。

---

## 2. 核心设计原则

### 2.1 两层渐进式架构

```
文档原文
  ↓
第一层：SemanticChunker（规则引擎）        ← 默认启用，零外部依赖
  ├─ 按换行切段落
  ├─ 识别章节标题（第X章、一、、1.、Article 等）
  ├─ 同章节段落归组
  └─ 组超过 chunk_size → 按段落边界进一步拆分
  ↓
第二层：LLM 精修（MiniMax，按空间配置启用）  ← 增强层
  ├─ 无标题文档的语义边界识别
  ├─ 多语言混合文档
  └─ 表格/列表等结构化内容处理
  ↓
最终 chunks（带 section_path）
```

### 2.2 LLM 不写内容，只管"找边界"

第二层 LLM 的职责与第一版方案一致——只返回段落分组索引，chunk 内容完全来自原文。

```
原文段落列表                           LLM 输出边界索引
┌──────────────────────┐              ┌──────────────────┐
│ [0] 第一章 概述       │              │ {                │
│ [1] 本文档旨在...     │   ──MiniMax→  │   "chunks": [    │
│ [2] 适用范围包括...   │              │     [0,1,2],     │
│ [3] 第二章 安装       │              │     [3,4],       │  → 按索引取原文拼接
│ [4] 安装前请确保...   │              │     [5,6,7]      │
│ [5] 第三章 配置       │              │   ]              │
│ [6] 配置文件位于...   │              │ }                │
│ [7] 支持以下参数...   │              └──────────────────┘
└──────────────────────┘
```

### 2.3 Fallback 机制

- SemanticChunker 规则引擎 → 即使识别不到任何标题，也能按段落边界切分（仍优于 FixedLengthChunker）
- LLM 调用失败/超时/格式异常 → 回退到 SemanticChunker 的规则结果
- 如果段落列表只有 1 段 → 回退到 FixedLengthChunker

---

## 3. 第一层：SemanticChunker 规则引擎

### 3.1 切分流程

```
输入文本
  ↓
Step 1: 按连续空行分割为段落（paragraphs）
  ↓
Step 2: 扫描段落列表，识别章节标题行
        - 中文：第X章、第X节、一、、（一）、1.、1）
        - 英文：Chapter X、Section X、Article X
        - 数字标题：1.、1.1、1.1.1
  ↓
Step 3: 以标题为锚点，将段落分组
        - 每个标题 + 其后续段落 → 一个 section
        - section_path 标注层级（如 "第三章 / 配置 / 数据库参数"）
  ↓
Step 4: 每组按 chunk_size 阈值检查
        - ≤ chunk_size → 直接作为一个 chunk
        - > chunk_size → 在段落边界进一步切分，每个子块 ≤ chunk_size
  ↓
输出 chunks（带 section_path）
```

### 3.2 标题识别规则

```python
SECTION_PATTERNS = [
    # 中文章节
    r'^第[零一二三四五六七八九十百千]+[章节条款]',   # 第一章、第三条
    r'^[一二三四五六七八九十]+[、．.]',              # 一、概述
    r'^（[一二三四五六七八九十]+）',                  # （一）
    r'^\d+[、．.]\s',                              # 1.  1、
    r'^\d+\.\d+',                                  # 1.1  2.3.1
    # 英文章节
    r'^(Chapter|Section|Article)\s+\d+',           # Chapter 1
    r'^Part\s+\d+',                                # Part I
    # 常见文档标题模式
    r'^(概述|前言|引言|总则|分则|附则|附录)',         # 中文文档常见 top-level
]
```

### 3.3 类设计

```python
# src/chunker/semantic_chunker.py

class SemanticChunker(BaseChunker):
    """基于规则的语义分片器 — 第一层"""

    def __init__(self, chunk_size: int = 1024, overlap_ratio: float = 0.1):
        self._chunk_size = chunk_size
        self._overlap_ratio = overlap_ratio

    def chunk(self, text: str, metadata: dict | None = None) -> ChunkResult:
        paragraphs = self._split_paragraphs(text)
        sections = self._group_by_headings(paragraphs)
        chunks = self._assemble_chunks(sections)
        return ChunkResult(chunks=chunks)

    def _split_paragraphs(self, text: str) -> list[str]:
        """按连续空行分割段落"""
        ...

    def _group_by_headings(self, paragraphs: list[str]) -> list[Section]:
        """识别标题，分组段落"""
        ...

    def _assemble_chunks(self, sections: list[Section]) -> list[ChunkInfo]:
        """按 chunk_size 阈值拼接，超出的在段落边界子切分"""
        ...
```

---

## 4. 第二层：MiniMax LLM 精修

### 4.1 MiniMax API 兼容性

MiniMax 提供标准 OpenAI 兼容接口：

```
POST https://api.minimax.chat/v1/text/chatcompletion_v2
Authorization: Bearer <MINIMAX_API_KEY>
Content-Type: application/json

{
  "model": "abab6.5s-chat",
  "messages": [
    {"role": "system", "content": "你是文档结构分析专家..."},
    {"role": "user", "content": "请为以下段落列表标注语义分片边界..."}
  ],
  "temperature": 0.0,
  "max_tokens": 4096
}
```

### 4.2 配置项

```yaml
# config/settings.yaml
kb_document_processor:
  intelligent_chunker:
    enabled: true
    api_base: "https://api.minimax.chat/v1/text/chatcompletion_v2"
    api_key: "${MINIMAX_API_KEY}"
    model: "abab6.5s-chat"
    temperature: 0.0
    max_tokens: 4096
    timeout_seconds: 30
    max_retries: 2
    batch_paragraphs: 80
```

API key 通过环境变量 `MINIMAX_API_KEY` 注入，不允许硬编码。

### 4.3 Prompt 设计

#### System Prompt

```
你是文档结构分析专家。你的任务是为给定的段落列表标注语义分片边界。

规则：
1. 每个段落有一个编号，格式为 [N]
2. 你需要在语义边界处切分，将段落分组
3. 同一章节/同一主题的段落尽量放在同一组
4. 遇到中文标题行（包含"第X章"、"一、"、"1."等），应在此处切分
5. 每组总字符数尽量不超过 chunk_size 字符，但不要为了凑字数而强行合并不同主题的段落
6. 只返回 JSON，不要包含任何其他文字
```

#### User Prompt 模板

```
请分析以下段落并返回语义分片边界：

{paragraph_list}

返回格式：
{
  "boundaries": [[0,3], [4,7], [8,12]]
}

// boundaries 中每个数组 [start, end] 表示将段落 start 到 end 合并为一个 chunk
// 边界必须连续且覆盖所有段落，不允许遗漏
```

### 4.4 LLM 增强模式

LLM 不替代规则引擎，而是作为**增强层**在以下场景介入：

1. **规则引擎置信度低时** — 没识别到任何标题，但文档较长（> 5 段）
2. **段落结构模糊时** — 无换行分隔的长文、多语言混合
3. **空间配置了 SMART_LLM 模式时** — 用户主动选择 LLM 增强

```
SemanticChunker.chunk(text)
  ↓
规则引擎产生初步分片 sections
  ↓
判断：是否需要 LLM 精修？
  - 条件1: 空间 chunkMode == "SMART_LLM"
  - 条件2: confidence < threshold (标题识别率低)
  ↓
是 → LLMChunker.get_boundaries(paragraphs)
  → 用 LLM 边界重新分组
否 → 直接使用规则分片
```

---

## 5. 代码实现清单

### 5.1 新增文件

| 文件 | 说明 |
|------|-----|
| `src/chunker/semantic_chunker.py` | SemanticChunker 规则引擎（替换 PHASE2 占位） |
| `src/chunker/llm_chunker.py` | LLMChunker 第二层精修 |
| `src/llm_client.py` | MiniMax HTTP 客户端 |

### 5.2 修改文件

| 文件 | 变更 |
|------|-----|
| `config/settings.yaml` | 新增 `intelligent_chunker` 配置段 |
| `src/config.py` | 新增 `IntelligentChunkerConfig` Pydantic 模型 |
| `src/pipeline.py` | `_chunk()` 方法根据 chunkMode 选择 chunker（SMART / SMART_LLM / FIXED_LENGTH） |
| `src/api/__init__.py` | 新增 `GET /docs/{doc_id}/chunks` 端点（分片可视化数据） |

### 5.3 前端变更

| 文件 | 变更 |
|------|-----|
| `kb-portal/web/src/api/http-client.ts` | 新增 `getDocChunks()` API 函数 |
| `kb-portal/web/src/components/ChunkVisualizer.tsx` | 新建分片可视化组件 |
| `kb-portal/web/src/app/documents/[id]/page.tsx` | 新增「查看分片」按钮 |
| `kb-portal/web/src/app/documents/upload/page.tsx` | chunkMode 下拉框新增 `SMART` / `SMART_LLM` |

---

## 6. 知识空间配置扩展

### 6.1 chunkMode 新增选项

| chunkMode | 说明 |
|-----------|------|
| `HEAD_FIRST` | 一期 FixedLengthChunker 从前往后（默认兼容） |
| `TAIL_FIRST` | 一期 FixedLengthChunker 从后往前 |
| `UNIFORM` | 一期 FixedLengthChunker 均匀切分 |
| `SMART` | **新增** — SemanticChunker 规则引擎 |
| `SMART_LLM` | **新增** — SemanticChunker + MiniMax LLM 精修 |

### 6.2 创建空间示例

```json
// POST /kb/v1/spaces
{
  "name": "合同库",
  "chunkSize": 1024,
  "overlapRatio": 10,
  "chunkMode": "SMART"
}
```

### 6.3 前端切片配置下拉框

```typescript
const CHUNK_MODES = [
  { label: '智能切分 (SMART)', value: 'SMART' },
  { label: '智能切分 + LLM增强 (SMART_LLM)', value: 'SMART_LLM' },
  { label: '固定长度-从头 (HEAD_FIRST)', value: 'HEAD_FIRST' },
  { label: '固定长度-从尾 (TAIL_FIRST)', value: 'TAIL_FIRST' },
  { label: '固定长度-均匀 (UNIFORM)', value: 'UNIFORM' },
];
```

---

## 7. 分片可视化

### 7.1 数据接口

```
GET /api/v1/docs/{doc_id}/chunks?version=1

Response:
{
  "docId": "DOC-xxx",
  "version": 1,
  "totalChunks": 8,
  "cleanedText": "第一章 概述\n\n本文档旨在...",
  "chunks": [
    {
      "chunkSeq": 1,
      "text": "第一章 概述\n本文档旨在说明...",
      "charCount": 512,
      "charStart": 0,
      "charEnd": 512,
      "sectionPath": "第一章 概述",
      "status": "READY"
    }
  ],
  "traceId": "tr-xxx"
}
```

### 7.2 可视化组件

ChunkVisualizer 组件提供两种视图：

**原文标注视图**（默认）：
- 左侧原文区域以彩色底色区分每个 chunk
- 每个 chunk 段首标注序号徽标
- 右侧分片索引面板，点击可滚动定位

**分片列表视图**：
- 卡片式列表展示每个 chunk
- 显示序号、字符数、状态、section_path、完整文本

### 7.3 入口

- 文档详情页新增「查看分片」按钮
- 当文档状态为 `READY` 时可点击
- 以 Modal 弹窗（90vw 宽度）展示

---

## 8. 缓存策略

同一文档（相同 sha256）切分结果不变，缓存可避免重复 LLM 调用：

```
cache key: sha256(chunkMode=SMART_LLM + cleaned_text[:256])
cache store: 本地文件或 Redis
TTL: 7 天
```

缓存命中 → 直接返回 `ChunkResult`，跳过 LLM 调用。

---

## 9. 风险与约束

| 风险 | 缓解措施 |
|------|---------|
| LLM API 超时/限流 | timeout=30s, max_retries=2, 回退到 SemanticChunker 规则结果 |
| LLM 返回格式异常 | json.loads 异常捕获 → 回退到规则结果 |
| 单篇文档段落数 > 80 | 分批发送，每批 80 段 |
| 成本 | 规则引擎零成本覆盖 80% 场景，LLM 仅在 SMART_LLM 模式下按需调用 |
| 隐私 | API 请求仅发送段落文本（每段截断至 200 字符），不发送原文全文 |
| 规则误识别 | 标题模式偏保守，宁可少识别也不误识别；误识别也不会丢文本 |

---

## 10. 实施步骤

| 步骤 | 内容 | 涉及文件 |
|------|------|---------|
| 1 | 实现 SemanticChunker 规则引擎 | `src/chunker/semantic_chunker.py` (~150 行) |
| 2 | 新增 `IntelligentChunkerConfig` + `settings.yaml` | `src/config.py` + `config/settings.yaml` |
| 3 | 新增 `src/llm_client.py`（MiniMax 客户端） | `src/llm_client.py` (~80 行) |
| 4 | 新增 `LLMChunker`（调用 LLM 精修） | `src/chunker/llm_chunker.py` (~100 行) |
| 5 | 修改 `pipeline.py` 的 `_chunk()` 方法 | `src/pipeline.py` (~10 行改) |
| 6 | 新增分片查询端点 | `src/api/__init__.py` (~45 行) |
| 7 | 前端 API + 可视化组件 + 入口按钮 | `http-client.ts` + `ChunkVisualizer.tsx` + `page.tsx` |
| 8 | 前端上传页 chunkMode 下拉框新增选项 | `upload/page.tsx` (~5 行) |
| 9 | chunkMode 新增 SMART/SMART_LLM（OpenAPI + 后端校验） | `ingest-service-v1.yaml` + ingest-service 校验 |
| 10 | 单元测试 | `test_semantic_chunker.py` + `test_llm_chunker.py` |

---

## 11. 未覆盖的边界情况

- 段落极长的结构化列表（目录、表格）→ 预切逻辑特殊处理
- 纯代码/日志类文档 → 规则引擎无法识别标题 → 按段落边界切分 + LLM 精修
- 多语言混合文档 → system prompt 指定主语言
- 扫描件 OCR 后文本（无格式）→ LLM 精修模式

以上在 POC 阶段按需补充。

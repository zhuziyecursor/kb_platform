# 多路召回（Hybrid Retrieval）完整技术方案

> 状态：📋 设计中 | 版本：v1.0 | 2026-05-14
>
> 目标读者：rag-service 开发者、vector-service / kb-doc-processor 维护者、QA / 评测同学
>
> 适用范围：本方案替换 [ChatServiceImpl.buildPipelineContext()](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java) 中 Step 5–Step 13 的检索链路，不影响入口/会话/Prompt/LLM 调用。
>
> 关联文档：[phase2-roadmap.md](../planning/phase2-roadmap.md) §三 检索增强 A.1–A.6 ；[tags-and-chunk-type.md](tags-and-chunk-type.md) ；[smart-chunking.md](smart-chunking.md)。

---

## 0. TL;DR

| 维度 | 现状 | 目标 |
|---|---|---|
| 召回通道数 | 名义 4 路（Dense / BM25 / FAQ / Clause），**实际 2 路**（Dense + BM25） | 5 路：Dense / Sparse(BM25) / Structured / Metadata / FAQ，全部参与融合 |
| BM25 索引数据 | `kb_knowledge.knowledge_search_idx` 表存在，**无任何服务写入** | vector-service 在 `embed-task` 消费侧同步写入 |
| 融合算法 | 朴素 RRF，k=60 固定，BM25-only 结果用原始分数旁路 | RRF 主干 + score z-norm 调整 + 通道权重（先静态、后学习） |
| 条款 Fast Path | [KeywordFallbackService.matchClause](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/KeywordFallbackService.java) 返回值未被消费 | 作为独立通道入融合，命中时 rank=1 强 boost |
| Sub-Query | LLM 改写返回 sub_queries，**未触发任何并发召回** | Dense 通道按 sub-queries 并发查询，rank max-pool |
| FAQ | 阈值 ≥0.95 短路，0.94 直接全丢 | 0.85≤score<0.95 进入融合作为高权重通道，≥0.95 才短路 |
| 多样性 | 无 MMR，同一 parent 的 chunk 可占满 Top5 | rerank 后 MMR（λ=0.7）+ parent-collapse |
| 通道归因 | `rag_pipeline_trace.hit_docs` 不区分来源 | 每个 citation 携带 `sourceChannels` ，trace 落库 |

落地分三批：

```
P0（1-1.5 周，必做）：修 ClauseMatch 死代码 + 补 BM25 写入链路 + 通道归因字段
P1（2-3 周，主体改造）：QueryPlanner + HybridFusion + Sub-Query 并发 + MMR
P2（1-2 周，可选增强）：Metadata 通道 + 学习权重 + Milvus 2.5 稀疏向量替代 PG BM25
```

---

## 1. 现状盘点

### 1.1 调用链路（当前）

```
Query
 └─ buildPipelineContext()
     ├─ Step 3 query_rewrite     ── LlmQueryRewriteService → 同义词降级
     ├─ Step 4 intent_route      ── CHITCHAT 短路
     ├─ Step 5 clause_fast_path  ── 计算后丢弃（见 §1.2 Bug A）
     ├─ Step 6 embedding         ── BGE-zh-v1.5, 1024 维
     ├─ Step 7 faq_shortcut      ── cosine ≥ 0.95 短路返回
     ├─ Step 8 bm25_search       ── PG tsvector（见 §1.2 Bug B）
     ├─ Step 9 milvus_search     ── ACL filter pushdown，topK=50
     ├─ Step 10 rrf_fusion       ── RRFFusionService.fuse(dense, bm25)
     ├─ Step 11 acl_post_filter
     ├─ Step 12 space_filter
     ├─ Step 13 rerank           ── BGE-Reranker-v2-m3, Top5
     ├─ Step 14 acl_verify
     └─ Step 15 parent_lookup
```

### 1.2 已确认问题清单

| # | 严重度 | 现象 | 证据 |
|---|------|------|------|
| **A** | 🔴 P0 | `clause_fast_path` 计算的 `ClauseMatch` 从不被读取 | [ChatServiceImpl.java:293-294](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java#L293-L294) 仅赋值，后续未引用 |
| **B** | 🔴 P0 | BM25 索引表无人写入 | `grep "knowledge_search_idx"` 在 vector-service 和 kb-doc-processor 中 0 命中；表是空的 |
| **C** | 🟠 P1 | PG `ts_rank` 不等于 BM25 | [SearchIndexRepository.java](../../kb-mcp/rag-service/src/main/java/com/kb/rag/repository/SearchIndexRepository.java) 用的是 `ts_rank` 不是 BM25 |
| **D** | 🟠 P1 | RRF 只融合 2 路；FAQ `mergeFaq()` 是空实现 | [RRFFusionService.java:94-101](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/RRFFusionService.java#L94-L101) |
| **E** | 🟠 P1 | BM25-only 结果用原始 `bm25Score` 塞进 `MilvusSearchResult.vectorScore` | [ChatServiceImpl.java:352-369](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java#L352-L369) ，与 RRF 分数量纲冲突 |
| **F** | 🟠 P1 | `LlmRewriteResponse.subQueries` 完全未消费 | grep 后只有写入点 |
| **G** | 🟡 P2 | tags / chunk_type / keywords / summary 已写 Milvus，但仅作 boost，不作召回通道 | [MilvusSearchService.java:46-52](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/MilvusSearchService.java#L46-L52) |
| **H** | 🟡 P2 | 同 parent_ref 的多个 chunk 可同时进 Top5，引用扎堆 | rerank 后无多样性约束 |
| **I** | 🟡 P2 | `hit_docs` 不含通道归因，A/B 评测缺关键归因维度 | [014_rag_pipeline_trace.sql:24](../../kb-infra/init-db/updates/014_rag_pipeline_trace.sql#L24) |
| **J** | 🟡 P2 | RRF k、topK、FAQ 阈值全硬编码，无 query-adaptive | application.yml 全是单值 |

---

## 2. 设计目标与非目标

### 2.1 目标

1. **召回完备性**：精确条款 query Recall@5 ≥ 0.85（当前估算 ≤ 0.55）；模糊语义 query Recall@5 不劣化。
2. **可解释性**：每条 citation 都能追溯到「由哪些通道贡献、各通道的 rank/score 是多少」。
3. **可调可控**：所有阈值/权重通过 `application.yml` 暴露，支持 Spring Cloud Config / Nacos 热更新（Phase 3）。
4. **架构守护**：不破坏 [CLAUDE.md](../../CLAUDE.md) 中的「表所有权」与「禁止跨服务调用」原则；新增通道仅消费 rag-service 已被授权的数据源。
5. **平滑过渡**：所有新通道默认 `enabled=false`，按 feature flag 灰度上线；可一键回滚到当前 Dense+BM25 RRF。

### 2.2 非目标

- 不在本方案讨论评测体系（见后续 `evaluation-system.md`）。
- 不替换 BGE-Reranker、不更换 embedding 模型。
- 不引入 OpenSearch / Elasticsearch（评估后纳入 Phase 3）。
- 不实现 GraphRAG / Knowledge Graph 检索。

---

## 3. 整体架构

### 3.1 新的检索链路

```
                              ┌──────────────────┐
                              │  QueryPlanner    │  ← 整合 query_rewrite + intent_route + clause_extract
                              └────────┬─────────┘
                                       │ RetrievalPlan
            ┌──────────────────────────┼────────────────────────────────┐
            ▼                          ▼                                ▼
   ┌──────────────┐         ┌──────────────────┐            ┌──────────────────┐
   │ DenseChannel │         │ SparseChannel    │            │ StructuredChannel│
   │  (Milvus)    │         │  (BM25)          │            │  (clause/section)│
   │  多 subQuery │         │  tsvector→Milvus │            │ knowledge_       │
   │  并发 + maxR │         │  Sparse 升级     │            │  structured.jsonb│
   └──────┬───────┘         └────────┬─────────┘            └────────┬─────────┘
          │                          │                                │
          │              ┌──────────────────────┐                     │
          │              │  MetadataChannel     │                     │
          │              │  tags/chunk_type/    │                     │
          │              │  biz_domain Filter   │                     │
          │              └────────┬─────────────┘                     │
          │                       │                                   │
          │              ┌──────────────────┐                         │
          │              │ FaqChannel       │                         │
          │              │ 0.85≤s<0.95 融合 │                         │
          │              │ s≥0.95 短路返回  │                         │
          │              └────────┬─────────┘                         │
          │                       │                                   │
          └─────────┬─────────────┴─────────────┬─────────────────────┘
                    ▼                            ▼
              ┌──────────────────────────────────────┐
              │       HybridFusionService            │
              │  RRF + z-norm + channelWeight + boost│
              └──────────────────┬───────────────────┘
                                 ▼
              ┌──────────────────────────────────────┐
              │  ACL post-filter + Space filter      │  ← 复用现有
              └──────────────────┬───────────────────┘
                                 ▼
              ┌──────────────────────────────────────┐
              │  Rerank (BGE-v2-m3) Top20→Top10      │  ← 扩窗到 Top10
              └──────────────────┬───────────────────┘
                                 ▼
              ┌──────────────────────────────────────┐
              │  MmrDiversitySelector  λ=0.7 → Top5  │  ← 新增
              │  + parent-collapse                   │
              └──────────────────┬───────────────────┘
                                 ▼
                          Citations[5]
                          (with sourceChannels)
```

### 3.2 通道清单（5 路）

| 通道 | 数据源 | 触发条件 | 召回上限 | 主要价值 |
|------|-------|---------|---------|--------|
| **Dense** | Milvus `vector` (HNSW, COSINE) | 默认全部 query | topK=50（每 sub-query 各 50） | 语义泛化，长尾覆盖 |
| **Sparse(BM25)** | `knowledge_search_idx.tokens` (tsvector) / 升级版 Milvus sparse | 默认全部 query | topK=50 | 关键词/编号/专名精确召回 |
| **Structured** | `knowledge_structured.json_body` (jsonb) | 命中条款编号 regex | topK=5 | 「第32条」「3.2.1 节」类的精确锚定 |
| **Metadata** | Milvus filter（无向量，仅 query） | LLM 提取出 `tags[]` / `chunk_type` 时 | topK=20 | "查所有 procedure 类"、"查 2026 年合规标签"类查询 |
| **FAQ** | `kb_knowledge.faq_knowledge` | `faq.enabled=true` | top=3 | 高频问答快速复用 |

### 3.3 关键设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|-----|-----|-----|
| Sub-Query 怎么用 | (a) 串行召回取交集 / (b) 并发召回 rank max-pool / (c) 改写后单 query | **(b)** | 多跳追问最重要的是「不漏掉任一意图」，并发+max-pool 既保召回又控延迟 |
| Sparse 短期实现 | (a) 继续 PG ts_rank / (b) 切 ts_rank_cd + 自定义 BM25 / (c) Milvus 2.5 sparse | **(b) 短期 + (c) 中期** | (a) 召回质量差；(c) 需升级 Milvus，影响面大；(b) 改动小，先解决"BM25 没数据"和"打分不准"两个问题 |
| FAQ 是否短路 | (a) 总是融合 / (b) 总是短路 / (c) 阈值双段 | **(c)** | ≥0.95 短路最便宜；0.85-0.95 进融合避免错过临界值；<0.85 不参与，避免噪声 |
| 融合算法 | (a) 加权和 / (b) RRF / (c) 学习排序 LTR | **RRF + score z-norm 修正** | RRF 是工业界默认；加 z-norm 处理通道稀疏；LTR 留给 Phase 3 用 feedback 数据训 |
| 通道归因存哪 | (a) 单独表 / (b) trace.hit_docs 扩展字段 / (c) citation DTO | **(b)+(c)** | (b) 持久化用于评测；(c) 接口透出给前端"高亮哪个 chunk 来自精确匹配" |

---

## 4. 数据层改动

### 4.1 表所有权（不变 + 新增）

| 表 | Schema | 拥有服务 | 用途 |
|----|------|---------|------|
| `kb_knowledge.knowledge_search_idx` | kb_knowledge | **vector-service**（写） / **rag-service**（读） | BM25 倒排（**现存表，无人写入**——P0 补） |
| `kb_knowledge.faq_knowledge` | kb_knowledge | **rag-service**（CRUD） | FAQ 表（现存） |
| `kb_knowledge.knowledge_structured` | kb_knowledge | **kb-doc-processor**（写） / **rag-service**（读 020 已授权） | 条款 jsonb（现存） |
| `kb_knowledge.retrieval_channel_weight` | kb_knowledge | **rag-service**（CRUD） | 🆕 通道权重学习结果落地（P2 引入） |

### 4.2 数据库迁移脚本

#### 4.2.1 `022_search_idx_bm25_columns.sql`（P0）

```sql
BEGIN;

-- 增加 BM25 真实分数所需的统计列（用 ts_rank_cd 时按段落归一）
ALTER TABLE kb_knowledge.knowledge_search_idx
    ADD COLUMN IF NOT EXISTS doc_length INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lang VARCHAR(8) NOT NULL DEFAULT 'zh';

-- 增加 keywords 列冗余（避免 join Milvus，加速倒排 → BM25 候选过滤）
ALTER TABLE kb_knowledge.knowledge_search_idx
    ADD COLUMN IF NOT EXISTS keywords TEXT;

-- 兜底：BM25 候选过滤时支持租户 + 时间窗
CREATE INDEX IF NOT EXISTS idx_search_idx_tenant_updated
    ON kb_knowledge.knowledge_search_idx (tenant_id, updated_at DESC);

COMMIT;
```

#### 4.2.2 `023_retrieval_channel_weight.sql`（P2）

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS kb_knowledge.retrieval_channel_weight (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    query_type      VARCHAR(32) NOT NULL,  -- POLICY_QA / DOC_SEARCH / DEFINITION / PROCEDURE / OTHER
    channel         VARCHAR(16) NOT NULL,  -- DENSE / SPARSE / STRUCTURED / METADATA / FAQ
    weight          DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    sample_size     INT NOT NULL DEFAULT 0,
    last_trained_at TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uk_channel_weight UNIQUE (tenant_id, query_type, channel)
);

GRANT SELECT, INSERT, UPDATE ON kb_knowledge.retrieval_channel_weight TO kb_rag;
GRANT USAGE, SELECT ON SEQUENCE kb_knowledge.retrieval_channel_weight_id_seq TO kb_rag;

COMMIT;
```

#### 4.2.3 `024_rag_trace_channel_attribution.sql`（P0）

```sql
BEGIN;

-- hit_docs 已经是 jsonb，无需改 schema；这里只是约定 jsonb 结构升级
COMMENT ON COLUMN kb_audit.rag_pipeline_trace.hit_docs IS
'引用文档摘要数组（v2）: [{docId,title,score,version,page,
  sourceChannels:[DENSE|SPARSE|STRUCTURED|METADATA|FAQ],
  channelRanks:{DENSE:3,SPARSE:1,...},
  fusionScore: float}]';

-- 增加通道命中计数列（聚合分析用，避免每次 unnest jsonb）
ALTER TABLE kb_audit.rag_pipeline_trace
    ADD COLUMN IF NOT EXISTS channel_hits JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN kb_audit.rag_pipeline_trace.channel_hits IS
'各通道召回数量统计: {DENSE:50, SPARSE:32, STRUCTURED:2, METADATA:0, FAQ:0,
  intersectionCount: 18, finalFromChannel: {DENSE:3, SPARSE:1, STRUCTURED:1}}';

COMMIT;
```

### 4.3 Milvus Collection 改动

**不改 schema**，但需要利用现有标量索引：
- `tags` 已建 INVERTED 索引 → Metadata 通道直接 filter
- `chunk_type` 未建 → 新增 INVERTED 索引（在 [kb_documents_collection.py](../../contracts/milvus/kb_documents_collection.py) 的 `get_scalar_index_fields()` 中追加）
- `keywords` 未建 → 新增 INVERTED 索引

Phase 3 评估：增加 `sparse_vector` 字段（Milvus 2.5+），将 PG BM25 整路下沉到 Milvus，省一跳数据库。

### 4.4 Kafka 契约改动

`contracts/kafka-schemas/embed-task-message.json` 已包含 `keywords` 字段（见 phase2-roadmap 1.4）。新增约束：

- **vector-service 消费 `embed-task` 时，必须在写 Milvus 的同事务里，额外写 `knowledge_search_idx`**（事务一致性靠业务幂等键 `tenant_id+doc_id+version+chunk_seq`）。
- 写入时调用 `pg_to_tsvector('simple', text_snippet || ' ' || keywords)`，附带 `doc_length=length(text_snippet)`。

---

## 5. 服务层改动

### 5.1 模块结构（rag-service）

```
com.kb.rag.service/
├── retrieval/                              ← 🆕 多路召回包
│   ├── QueryPlanner.java                   ← 🆕 整合 rewrite+route+clause+metadata 提取
│   ├── RetrievalPlan.java                  ← 🆕 record，对外契约
│   ├── channel/
│   │   ├── RetrievalChannel.java           ← 🆕 接口
│   │   ├── DenseChannel.java               ← 🆕 包装现 MilvusSearchService
│   │   ├── SparseChannel.java              ← 🆕 包装现 Bm25SearchService（升级 ts_rank_cd）
│   │   ├── StructuredChannel.java          ← 🆕 修复 ClauseMatch → 真正返回结果
│   │   ├── MetadataChannel.java            ← 🆕 P2
│   │   └── FaqChannel.java                 ← 🆕 包装现 FaqService，新增"融合模式"
│   ├── fusion/
│   │   ├── HybridFusionService.java        ← 🆕 替换 RRFFusionService
│   │   ├── ChannelWeightProvider.java      ← 🆕 P2 学习权重
│   │   └── FusedHit.java                   ← 🆕 record
│   ├── diversity/
│   │   └── MmrDiversitySelector.java       ← 🆕 P1
│   └── attribution/
│       └── ChannelAttribution.java         ← 🆕 用于 trace.hit_docs / CitationDto
├── ChatServiceImpl.java                    ← ✏️ buildPipelineContext 重写为调用 QueryPlanner+ChannelExecutor
├── MilvusSearchService.java                ← ✏️ 改造为「无 boost、纯 dense」由 DenseChannel 调用
├── Bm25SearchService.java                  ← ✏️ 改造 SQL：ts_rank_cd + 中文配置项 + doc_length 归一
├── KeywordFallbackService.java             ← ✏️ 暴露 ClauseHit DTO 给 StructuredChannel 复用
├── RRFFusionService.java                   ← 🗑️ P1 完成后删除
└── FaqService.java                         ← ✏️ split：matchShortcut() + matchForFusion()
```

### 5.2 核心接口设计

#### 5.2.1 `QueryPlanner`（替代 query_rewrite + intent_route + clause_extract）

```java
public interface QueryPlanner {
    RetrievalPlan plan(String tenantId, String rawQuery, List<SessionService.Turn> history);
}

public record RetrievalPlan(
        String traceId,
        String tenantId,
        String rawQuery,
        String rewrittenQuery,         // 主 query（用于 prompt、cache key）
        List<String> subQueries,       // 用于 DenseChannel 并发，去重后≤3
        List<String> keywords,         // BM25/Metadata 通道使用
        Set<String> clauseRefs,        // 第X条/3.2.1，StructuredChannel 使用
        List<String> tagFilters,       // Metadata 通道使用，AND 关系
        String chunkTypeFilter,        // Metadata 通道使用
        QueryType queryType,           // POLICY_QA / DOC_SEARCH / DEFINITION / PROCEDURE / CHITCHAT / OTHER
        RouteDecision routeDecision,   // FULL_RAG / DOC_SEARCH / CHITCHAT
        Set<ChannelId> enabledChannels // 由 QueryType 自动选择，运维可覆盖
) {}

public enum ChannelId { DENSE, SPARSE, STRUCTURED, METADATA, FAQ }
public enum QueryType { POLICY_QA, DOC_SEARCH, DEFINITION, PROCEDURE, CHITCHAT, OTHER }
```

**QueryType → 默认通道矩阵：**

| QueryType | DENSE | SPARSE | STRUCTURED | METADATA | FAQ | rerankTopK |
|-----------|-------|--------|------------|----------|-----|------------|
| POLICY_QA | ✅ | ✅ | ✅ if clauseRefs ≠ ∅ | ✅ if chunkType=rule | ✅ | 10 |
| DOC_SEARCH | ✅ | ✅ | ❌ | ✅ | ❌ | 20 |
| DEFINITION | ✅ | ✅ | ❌ | ✅ chunkType=definition | ✅ | 10 |
| PROCEDURE | ✅ | ✅ | ❌ | ✅ chunkType=procedure | ✅ | 10 |
| OTHER | ✅ | ✅ | ❌ | ❌ | ❌ | 10 |

**实现路径：** 复用现有 [LlmQueryRewriteService](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/LlmQueryRewriteService.java)，把 prompt 升级为同时输出 `tagFilters`、`chunkTypeFilter`、`queryType`。LLM 不可用时降级为：`QueryType=OTHER, channels={DENSE, SPARSE}`。

#### 5.2.2 `RetrievalChannel` 接口

```java
public interface RetrievalChannel {
    ChannelId id();
    boolean isApplicable(RetrievalPlan plan);

    /**
     * 返回带 rank 的命中列表。rank 从 1 开始，越小越相关。
     * @param plan      RetrievalPlan
     * @param topK      该通道的召回上限
     * @return List<ChannelHit>，已按 rank 升序
     */
    List<ChannelHit> retrieve(RetrievalPlan plan, int topK);
}

public record ChannelHit(
        ChannelId channel,
        String docId,
        int version,
        int chunkSeq,
        int rank,                  // 1-based
        double rawScore,           // 通道原始分（dense=cosine, sparse=ts_rank_cd, structured=1.0, faq=cosine）
        String text,
        String title,
        Map<String, Object> meta   // sectionPath / page / parent_ref 等
) {}
```

通道执行采用并发：

```java
@Service
public class ChannelExecutor {
    private final List<RetrievalChannel> channels;
    private final Executor channelPool; // 线程池，默认 corePool=channels.size()

    public Map<ChannelId, List<ChannelHit>> execute(RetrievalPlan plan, Map<ChannelId, Integer> topKMap) {
        List<CompletableFuture<Map.Entry<ChannelId, List<ChannelHit>>>> futures =
            channels.stream()
                .filter(c -> plan.enabledChannels().contains(c.id()) && c.isApplicable(plan))
                .map(c -> CompletableFuture.supplyAsync(
                    () -> Map.entry(c.id(), c.retrieve(plan, topKMap.get(c.id()))),
                    channelPool))
                .toList();
        // 总超时：max(各通道 timeout) + 200ms 余量
        return futures.stream()
            .map(f -> f.completeOnTimeout(Map.entry(...emptyFallback), 800, MILLISECONDS).join())
            .collect(toMap(Entry::getKey, Entry::getValue));
    }
}
```

**关键超时约定：**
- DENSE：500ms（多 sub-query 串行，每个 ≤ 200ms）
- SPARSE：300ms（PG 全文检索）
- STRUCTURED：200ms（PG jsonb GIN 索引）
- METADATA：300ms（Milvus filter-only query，无向量）
- FAQ：100ms（内存缓存 + 余弦）
- 总并发超时：800ms（最慢通道兜底）

#### 5.2.3 `HybridFusionService`

```java
public record FusedHit(
        String docId,
        int chunkSeq,
        double fusionScore,
        Map<ChannelId, Integer> channelRanks,   // 各通道 rank
        Map<ChannelId, Double> channelScores,   // 各通道 rawScore
        ChannelHit representative               // 用于取 text/title 等内容
) {}

public class HybridFusionService {

    @Value("${app.fusion.rrf-k:60}")          int rrfK;
    @Value("${app.fusion.score-norm-weight:0.3}") double scoreNormWeight;
    private final ChannelWeightProvider weights;

    public List<FusedHit> fuse(Map<ChannelId, List<ChannelHit>> perChannel, RetrievalPlan plan) {
        // 1. z-norm 每通道的 rawScore
        Map<ChannelId, Function<Double,Double>> normalizers = perChannel.entrySet().stream()
            .collect(toMap(Entry::getKey, e -> ZScoreNormalizer.fit(e.getValue())));

        // 2. 按 (docId,chunkSeq) 聚合
        Map<String, Accumulator> acc = new LinkedHashMap<>();
        perChannel.forEach((cid, hits) -> {
            double w = weights.get(plan.tenantId(), plan.queryType(), cid);
            for (ChannelHit h : hits) {
                String key = h.docId() + "|" + h.chunkSeq();
                Accumulator a = acc.computeIfAbsent(key, k -> new Accumulator(h));
                double rrf = 1.0 / (rrfK + h.rank());
                double normedScore = normalizers.get(cid).apply(h.rawScore());
                a.add(cid, h.rank(), h.rawScore(),
                      w * (rrf + scoreNormWeight * sigmoid(normedScore)));
            }
        });

        // 3. 通道特殊 boost
        for (Accumulator a : acc.values()) {
            if (a.hits(ChannelId.STRUCTURED) && a.rank(ChannelId.STRUCTURED) == 1) {
                a.boost(0.5);  // 条款 rank=1 强 boost
            }
            int channelCount = a.channelCount();
            if (channelCount >= 3) a.boost(0.1);  // 多通道命中加分（投票）
        }

        return acc.values().stream()
            .map(Accumulator::toFusedHit)
            .sorted(comparingDouble(FusedHit::fusionScore).reversed())
            .toList();
    }
}
```

**为什么不是纯 RRF：**
- 纯 RRF 抹掉了「Dense 余弦 0.92 vs 0.31」的强弱差距
- z-norm 让通道内强分数可以撬动排名（用 sigmoid 防止极端值压垮 RRF 主干）
- `scoreNormWeight=0.3` 给 RRF 留 70% 权重，是 RRF 与加权和的折衷

#### 5.2.4 `StructuredChannel`（修复 Bug A 的正确出口）

```java
@Service
@RequiredArgsConstructor
public class StructuredChannel implements RetrievalChannel {
    private final KnowledgeStructuredRepository repo;

    public ChannelId id() { return ChannelId.STRUCTURED; }
    public boolean isApplicable(RetrievalPlan plan) { return !plan.clauseRefs().isEmpty(); }

    public List<ChannelHit> retrieve(RetrievalPlan plan, int topK) {
        List<ChannelHit> hits = new ArrayList<>();
        int rank = 1;
        for (String clauseRef : plan.clauseRefs()) {
            List<Object[]> rows = repo.findBySectionPath(plan.tenantId(), clauseRef, topK);
            for (Object[] row : rows) {
                hits.add(new ChannelHit(
                    ChannelId.STRUCTURED,
                    (String) row[0], ((Number) row[1]).intValue(), ((Number) row[6]).intValue(),
                    rank++, /*rawScore*/ 1.0,
                    (String) row[3], (String) row[2],
                    Map.of("sectionPath", clauseRef)));
                if (hits.size() >= topK) return hits;
            }
        }
        return hits;
    }
}
```

注意：StructuredChannel 返回的是「条款级别命中的代表 chunk」，融合后这些 chunk 走与其它通道相同的 ACL/space/rerank 链路（rerank 仍会重新排序），但融合阶段给了它强 boost。**这意味着即使 rerank 模型不擅长精确条款匹配，融合也能保送进 Top10。**

#### 5.2.5 `MmrDiversitySelector`

```java
@Service
public class MmrDiversitySelector {
    @Value("${app.diversity.mmr-lambda:0.7}")   double lambda;
    @Value("${app.diversity.parent-collapse:true}") boolean parentCollapse;

    public List<MilvusSearchResult> select(List<MilvusSearchResult> reranked, List<Float> queryVec, int topN) {
        if (reranked.isEmpty()) return reranked;
        List<MilvusSearchResult> pool = parentCollapse ? collapseByParent(reranked) : new ArrayList<>(reranked);
        List<MilvusSearchResult> selected = new ArrayList<>();
        selected.add(pool.remove(0));
        while (selected.size() < topN && !pool.isEmpty()) {
            int bestIdx = -1; double bestScore = Double.NEGATIVE_INFINITY;
            for (int i = 0; i < pool.size(); i++) {
                MilvusSearchResult cand = pool.get(i);
                double rel = cand.getVectorScore();
                double maxSim = selected.stream()
                    .mapToDouble(s -> textSim(cand.getText(), s.getText())).max().orElse(0);
                double mmr = lambda * rel - (1 - lambda) * maxSim;
                if (mmr > bestScore) { bestScore = mmr; bestIdx = i; }
            }
            if (bestIdx >= 0) selected.add(pool.remove(bestIdx));
        }
        return selected;
    }

    /** 同 parent_ref 仅保留 rerank 最高分的一条 */
    private List<MilvusSearchResult> collapseByParent(List<MilvusSearchResult> in) {
        Map<String, MilvusSearchResult> byParent = new LinkedHashMap<>();
        for (MilvusSearchResult r : in) {
            String pref = Optional.ofNullable(r.getParentRef()).orElse("__solo__" + r.getDocId() + r.getChunkSeq());
            byParent.merge(pref, r, (old, neu) -> old.getVectorScore() >= neu.getVectorScore() ? old : neu);
        }
        return new ArrayList<>(byParent.values());
    }

    private double textSim(String a, String b) {
        // 轻量：char-trigram jaccard，避免再调 embedding；50 字符以上稳定
        return Jaccard.charTrigram(a, b);
    }
}
```

### 5.3 vector-service 改动（关键，补 Bug B）

`EmbedTaskConsumer` 在写 Milvus 成功后，**新增同步写 `knowledge_search_idx`**：

```java
// kb-mcp/vector-service/src/main/java/com/kb/vector/service/EmbedTaskConsumer.java
@KafkaListener(topics = "embed-task")
public void consume(EmbedTaskMessage msg) {
    // 1. 现有：调 embedding-service → 写 Milvus
    milvusService.upsert(...);

    // 2. 🆕 同步写 BM25 倒排
    searchIndexWriter.upsert(SearchIndexRow.builder()
        .tenantId(msg.getTenantId())
        .docId(msg.getDocId()).version(msg.getVersion()).chunkSeq(msg.getChunkSeq())
        .title(msg.getTitle())
        .textSnippet(msg.getText())
        .keywords(msg.getKeywords())
        .docLength(msg.getText().length())
        .lang(msg.getLang())
        .build());
    // tokens 列由 PG 触发器 / 上游 SQL 在 INSERT 时计算 to_tsvector('simple', text_snippet||' '||keywords)
}
```

**幂等键**：`(tenant_id, doc_id, version, chunk_seq) UPSERT`，复用现有迁移脚本里的 unique index。**回填策略**：Phase 2 上线前用一次性脚本扫 `knowledge_clean` + Milvus，补齐历史数据；脚本放 `kb-infra/init-db/backfill/`。

### 5.4 kb-doc-processor 改动

无强制改动。元数据抽取（keywords / summary）已在 [phase2-roadmap 1.4](../planning/phase2-roadmap.md) 完成，本方案直接复用。

---

## 6. 接口契约改动

### 6.1 OpenAPI `rag-service-v1.yaml`

`Citation` schema 增加可选字段（向后兼容）：

```yaml
Citation:
  type: object
  properties:
    # ... 现有字段
    sourceChannels:
      type: array
      items:
        type: string
        enum: [DENSE, SPARSE, STRUCTURED, METADATA, FAQ]
      description: "命中此 citation 的召回通道集合"
    channelRanks:
      type: object
      additionalProperties: { type: integer }
      description: "各通道内的 rank（1-based），仅在 trace 详情接口下展开"
```

`ChatResponse` 增加：

```yaml
ChatResponse:
  type: object
  properties:
    # ... 现有字段
    searchMode:
      type: string
      enum: [DENSE, SPARSE, HYBRID, STRUCTURED_FAST, FAQ]
      description: "本次检索的实际形态。HYBRID 表示至少 2 个通道贡献了 Top5"
    channelStats:
      type: object
      additionalProperties: { type: integer }
      example: { "DENSE": 50, "SPARSE": 32, "STRUCTURED": 2 }
```

### 6.2 Trace 详情接口

`GET /rag/v1/traces/{traceId}` 返回的 `hitDocs` 升级为 v2 结构（兼容旧消费者：v1 字段保留）。

---

## 7. 配置项汇总

新增到 [rag-service application.yml](../../kb-mcp/rag-service/src/main/resources/application.yml)：

```yaml
app:
  retrieval:
    plan:
      llm-enabled: ${RAG_PLANNER_LLM_ENABLED:true}
      llm-timeout-ms: ${RAG_PLANNER_LLM_TIMEOUT_MS:1500}
      cache-ttl-minutes: ${RAG_PLANNER_CACHE_TTL:30}
    channels:
      dense:
        enabled: true
        top-k: 50
        sub-query-max: 3        # ≤3 subQueries 并发；超过会被截断
        timeout-ms: 500
      sparse:
        enabled: true
        top-k: 50
        ts-config: simple        # 升级到 zhparser 后改 chinese
        score-fn: ts_rank_cd     # 替代当前 ts_rank
        timeout-ms: 300
      structured:
        enabled: true
        top-k: 5
        timeout-ms: 200
      metadata:
        enabled: false           # P2 上线
        top-k: 20
        timeout-ms: 300
      faq:
        enabled: true
        shortcut-threshold: 0.95
        fusion-threshold: 0.85
        top-k: 3
        timeout-ms: 100
    fusion:
      rrf-k: 60
      score-norm-weight: 0.3
      multi-channel-boost: 0.10       # 命中≥3 通道时加分
      structured-rank1-boost: 0.50    # STRUCTURED rank=1 强 boost
      use-learned-weights: false      # P2 上线
    diversity:
      enabled: true
      mmr-lambda: 0.7
      parent-collapse: true
      pool-size: 10                   # rerank 后 Top10 进 MMR，输出 Top5
    rerank:
      final-top-k: 10                 # ⚠️ 从 5 改为 10，给 MMR 留池子
      mmr-output-top-k: 5             # MMR 输出 Top5 作为最终 citations
```

**回滚开关**：把所有 `enabled` 设为 false，并设置 `fusion.score-norm-weight=0` 即退回到当前朴素 RRF + Top5 直出。

---

## 8. 前端配合

**最小改动**（位于 [app/rag/page.tsx](../../kb-portal/web/src/app/rag/page.tsx)）：

1. citation 卡片右上角增加通道徽章：
   ```
   ┌─ [向量+条款] 采购制度 第3.2.1条 ┐
   │  ...                                 │
   └──────────────────────────────────────┘
   ```
   - `DENSE` → 蓝色 ▣
   - `SPARSE` → 绿色 ▣
   - `STRUCTURED` → 橙色 ⚖
   - `METADATA` → 紫色 #
   - `FAQ` → 黄色 ★

2. trace 详情页（已有）追加「各通道召回统计」面板，展示 `channelStats` 与 `channel_hits`。

3. 不破坏现有契约：所有新字段在前端按 optional 处理。

---

## 9. 落地分批

### 9.1 P0 — 补漏 + 通道归因（1-1.5 周）

| 任务 | 文件 | 验收 |
|------|-----|------|
| 修 ClauseMatch 死代码（最小改动版） | `ChatServiceImpl.buildPipelineContext` 把 `clauseMatch` 结果合入 `combinedResults`，rank=1 boost | `第32条规定了什么` query 命中包含该条款的 doc，Top1 精确 |
| 补 BM25 写入 | `vector-service/EmbedTaskConsumer` + `SearchIndexWriter` + 一次性回填脚本 | `select count(*) from knowledge_search_idx` 与 Milvus 一致；新上传文档 < 30s 出现在倒排 |
| 通道归因字段透出 | `CitationDto.sourceChannels` + `rag_pipeline_trace.channel_hits` + `024_*.sql` | trace 详情 API 能查到每个 citation 的 sourceChannels |

### 9.2 P1 — QueryPlanner + HybridFusion + MMR（2-3 周）

| 任务 | 关键交付 |
|------|---------|
| 引入 retrieval/ 包，定义 `RetrievalChannel` / `RetrievalPlan` | 包结构 + ArchUnit 测试守护 |
| `QueryPlanner` 实现 + LLM prompt 升级 | 输出 `subQueries / queryType / tagFilters` |
| `DenseChannel` 接管 subQueries 并发 | 复用 `MilvusSearchService`，加 `RankMaxPool` 工具类 |
| `SparseChannel`：SQL 升级到 ts_rank_cd | 文档级 BM25 候选 → 段落归一打分 |
| `StructuredChannel`：把死代码激活为真通道 | 命中条款时 rank=1 进融合 |
| `HybridFusionService` | 替换 RRFFusionService；老类标记 @Deprecated |
| `MmrDiversitySelector` + rerank Top10 池子 | 引用扎堆消失 |
| 前端徽章 + trace 通道统计面板 | UI 自洽 |
| ArchUnit 守护 | retrieval 包内不允许访问 `MinioClient`、`KafkaTemplate` |

### 9.3 P2 — Metadata 通道 + 学习权重 + Milvus 2.5 sparse（1-2 周）

| 任务 | 备注 |
|------|------|
| `MetadataChannel` | 基于 Milvus filter-only query，无向量；topK=20 |
| `ChannelWeightProvider` + `023_*.sql` | 起步用人工配置；积累 feedback ≥ 1000 条后跑 Logistic Regression |
| Milvus 2.5 升级 + sparse vector 集成 | 评估后单独立项；不阻塞 P1 |

---

## 10. 验收标准

### 10.1 召回质量

| 指标 | 当前估算 | P0 后 | P1 后 |
|------|--------|------|------|
| 条款编号 query Recall@5 | ≤ 0.55 | ≥ 0.80 | ≥ 0.90 |
| 模糊语义 query Recall@5 | ~0.70 | ≥ 0.70 (不劣化) | ≥ 0.75 |
| 引用多样性 (不同 parent_ref 占比) | ~0.6 | ~0.6 | ≥ 0.85 |
| 通道归因覆盖率 (有 sourceChannels 的 citation 比例) | 0% | 100% | 100% |

### 10.2 性能

| 指标 | 上限 |
|------|-----|
| 多通道并发总延迟 P95 | < 800ms（rerank 之前） |
| 端到端 chat P95 | < 2.5s（rerank+LLM 不变） |
| 端到端 stream 首 token P95 | < 1.5s（与现状持平） |
| Milvus QPS 增长 | < +50%（subQueries ≤ 3） |

### 10.3 安全 / 兼容

- 任何通道都必须在 ACL/space filter 之前不绕过 `tenant_id`；ArchUnit 守护 `RetrievalChannel` 实现类的 SQL 中必须包含 `tenant_id` 参数。
- 所有新字段在 OpenAPI 中标记 optional，前端旧版本不报错。
- 回滚：所有 channel.enabled=false 后，行为等价 P0 之前的 Dense+BM25 RRF。

---

## 11. 风险与缓解

| 风险 | 概率 | 缓解 |
|------|-----|------|
| LLM Planner 超时拖慢首响 | 中 | 1.5s 超时降级到规则 Planner（同义词+条款抽取） |
| 多 subQuery 并发打爆 embedding-service | 中 | `sub-query-max=3`；embedding 调用合并为 batch；Redis 缓存 query→vector |
| BM25 写入失败导致 vector 与倒排不一致 | 高 | 失败入 `embed-task.DLQ`；后台 reconcile job 每小时核对 |
| 通道权重学错导致质量下降 | 中 | P2 默认 `use-learned-weights=false`；权重必须经 eval 集回归测试通过才能上线 |
| MMR 误伤合法的多分块答案 | 低 | `parent-collapse=true` 已天然处理；λ 可调；引用扎堆问题可视化在 trace |
| BM25 历史数据回填耗时 | 中 | 增量 + 限流；先按 tenant 优先级回填 |

---

## 12. 改动范围矩阵

| 模块 | 文件 | 改动量 |
|------|-----|------|
| **rag-service / 新增** | `service/retrieval/**` | ~15 个新文件，~1.5kloc |
| **rag-service / 修改** | `ChatServiceImpl` (Step 5-15 重写), `MilvusSearchService`, `Bm25SearchService`, `KeywordFallbackService`, `FaqService`, `dto/CitationDto`, `service/PipelineTraceService` | ~6 个文件，~400 行 |
| **rag-service / 删除** | `RRFFusionService` | P1 完成后 |
| **vector-service / 新增** | `service/SearchIndexWriter.java` | ~1 个文件，~150 行 |
| **vector-service / 修改** | `service/EmbedTaskConsumer.java` | ~30 行 |
| **kb-doc-processor** | 无强制改动 | — |
| **DB 迁移** | `022_search_idx_bm25_columns.sql`, `023_retrieval_channel_weight.sql`, `024_rag_trace_channel_attribution.sql` | 3 个脚本 |
| **Milvus 索引** | `kb_documents_collection.py` 追加 `chunk_type / keywords` INVERTED 索引 | ~10 行 |
| **契约** | `contracts/openapi/rag-service-v1.yaml` 新增 schema 字段 | ~20 行 |
| **前端** | `app/rag/page.tsx` 通道徽章；trace 详情通道面板 | ~150 行 |
| **回填脚本** | `kb-infra/init-db/backfill/backfill_search_idx.sql` | ~50 行 |
| **测试** | `RagServiceArchTest` 新规则；`HybridFusionServiceTest`；`MmrDiversitySelectorTest`；`QueryPlannerTest` | ≥ 30 个单测 |

---

## 13. 不在本方案范围（避免范围蔓延）

- **评测体系**：将单独成文 `docs/features/evaluation-system.md`，包含 golden set、Recall@K 计算、LLM-as-judge、A/B 框架、Badcase 闭环回灌。
- **OIDC/OBO 真权限**：本方案仍假设 `DevContextProperties` 提供 tenant/sec_level/perm_group_ids，Phase 3 接入真 JWT。
- **图谱检索 / KG-RAG**：暂不引入；StructuredChannel 已能覆盖大部分制度文档场景。
- **多模态召回（图文）**：未来若引入 image embedding 模型，再新增 `ImageChannel` 即可，本架构天然兼容。

---

## 附录 A：典型 Query 走查

### A.1 「采购合同的审批流程是什么？」

```
QueryPlanner:
  rewrittenQuery = "采购合同 审批流程 步骤"
  subQueries = ["采购合同 审批流程", "采购合同 签订流程", "采购合同 审核 节点"]
  keywords = ["采购", "合同", "审批", "流程"]
  clauseRefs = ∅
  tagFilters = []
  chunkTypeFilter = "procedure"
  queryType = PROCEDURE
  enabledChannels = {DENSE, SPARSE, METADATA, FAQ}

通道结果（示意 rank-1 命中）：
  DENSE   : 50 条 → (D1, c=0.91), (D2, c=0.88), ...
  SPARSE  : 30 条 → (D1, b=0.65), (D5, b=0.61), ...
  METADATA: 12 条 chunk_type=procedure → (D1, _), (D2,_), ...
  FAQ     : 1 条 cos=0.88，融合权重 0.7 → 不短路

HybridFusion:
  D1 命中 3 通道 → multi-channel-boost +0.1
  fusionScore 排序：D1 > D2 > D5 > ...

Rerank Top10 → MMR 输出 Top5（parent-collapse 把 D1 的相邻 chunk 合成 1 条）
最终 citations.sourceChannels = [{DENSE,SPARSE,METADATA}, {DENSE,SPARSE}, ...]
```

### A.2 「第三十二条规定了什么？」

```
QueryPlanner:
  clauseRefs = {"第三十二条"}
  queryType = POLICY_QA
  enabledChannels = {DENSE, SPARSE, STRUCTURED, FAQ}

通道结果：
  STRUCTURED: 1 条精确命中 (rank=1, rawScore=1.0)
  DENSE     : 50 条（语义"第三十二条"附近段落）
  SPARSE    : 8 条
  FAQ       : 无

HybridFusion:
  STRUCTURED rank=1 → structured-rank1-boost +0.5
  该 chunk 即使 dense 余弦只有 0.45，仍排第 1
Rerank → MMR → Top5
```

### A.3 「你好」

```
QueryPlanner:
  queryType = CHITCHAT
  routeDecision = CHITCHAT
  enabledChannels = {}

→ 走 ChatServiceImpl.buildChitchatPrompt，不进任何检索通道
```

---

## 附录 B：Open Questions（待评审）

1. **`structured-rank1-boost=0.5` 是否过大？** 极端情况下可能让 STRUCTURED 命中的弱相关 chunk 排到第 1。建议在 evaluation-system 上线后用 100 条人工标的条款 query 集校准。
2. **MMR 用 char-trigram Jaccard 是否够用？** 短文本上 jaccard 不稳。如果出现误伤，可降级 fallback 到「同 parent_ref 即视为重复」。
3. **是否需要 Per-tenant 通道开关？** 当前设计是全租户共用 config。若某租户业务全是制度类文档，可单独把 metadata 通道关掉。建议 Phase 3 引入 `tenant_config` 后再做。
4. **FAQ 短路阈值是否要与 LLM 自评置信度联动？** 例如 FAQ 0.96 但 LLM HIGH，才信任短路；FAQ 0.96 但 LLM LOW 时退回融合。需要 feedback 数据支持。

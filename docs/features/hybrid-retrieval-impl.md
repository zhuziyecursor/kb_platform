# 多路召回落地实施手册

> 状态：📋 待实施 | 版本：v1.0 | 2026-05-14
>
> **本文档定位：** [hybrid-retrieval.md](hybrid-retrieval.md) 解释"为什么这么设计"。本手册解释"怎么干、谁干、什么时候干、出问题怎么办"。
>
> **核心补强：** 把上一版方案漏掉的 ACL 安全洞、非事务双写、单通道异常分级、embedding 联动、灰度切流、故障预案 全部纳入实施任务。
>
> **阅读路径：** §0 快速导航 → §1 Sprint 规划 → 按 Sprint 顺序读 Task → §10-§14 上线 / 回滚 / 故障手册。

---

## 0. 快速导航

| 我想做什么 | 看哪里 |
|---|---|
| 了解整体节奏 | §1 Sprint 规划 |
| 安全洞修复（**必须先做**） | §2.2 Task 1.2 |
| 把 BM25 表填上数据 | §2.1 Task 1.1 |
| 修死代码 ClauseMatch | §2.3 Task 1.3 |
| 单通道挂了怎么办 | §3.2 Task 2.2 + §13 故障预案 |
| Milvus / PG 不一致 | §3.3 Task 2.3 |
| QueryPlanner / 多路 / 融合 / MMR | §4 Sprint 3 |
| 灰度发布与切量 | §5.4 Task 4.4 |
| 上线前要做什么检查 | §11 上线 checklist |
| 线上出事如何回滚 | §12 回滚预案 |

---

## 1. Sprint 规划

> 假设 1 名后端 + 0.5 名前端 + 0.5 名 QA。整体 5-6 周，按 2 周一次发版节奏。

| Sprint | 时长 | 主题 | 是否阻塞主流程 |
|---|---|---|---|
| Sprint 1 | 1 周 | P0 基础修复：BM25 数据 + ACL 字段 + ClauseMatch + fusion key | 是 |
| Sprint 2 | 1 周 | P0 通道归因 + 异常分级 + reconcile job | 否（默认行为不变） |
| Sprint 3 | 2 周 | P1 多路框架：QueryPlanner / 三通道 / HybridFusion / MMR | 否（feature flag） |
| Sprint 4 | 1 周 | P1 兜底：Circuit Breaker / embedding batch / 灰度 / 可观测 | 否 |
| Sprint 5 | 1-2 周 | P2 增强：Metadata 通道 / 学习权重（可选） | 否 |

**全局原则：**
- 每个 Sprint 末尾发版；P1/P2 全部上线时 `app.retrieval.rollout-percent=0`，灰度推进与代码发版解耦。
- 任意 Task 失败时不影响下一个 Sprint 已合并的工作。
- Sprint 1 + Sprint 2 完成后即可对外宣称"多路召回 v1"已基础具备（消除安全洞 + 通道可观测）。

---

## 2. Sprint 1：P0 基础修复（Week 1，阻塞）

> 本 Sprint 的所有任务都不是"新功能"，是修补**现状即存在的漏洞**。即使后续 Sprint 不做，这 4 个 Task 也必须先合入主干。

### 2.1 Task 1.1 — 补 BM25 写入链路

**风险等级：** 🔴 P0（基础设施空跑）

**背景：** `kb_knowledge.knowledge_search_idx` 表自 [019_bm25_search_index.sql](../../kb-infra/init-db/updates/019_bm25_search_index.sql) 创建以来无任何服务写入；[Bm25SearchService](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/Bm25SearchService.java) 每次查到 0 条，RRF 退化成纯 Dense。

**改动范围：**

```
新增：
  kb-mcp/vector-service/src/main/java/com/kb/vector/service/SearchIndexWriter.java
  kb-mcp/vector-service/src/main/java/com/kb/vector/entity/KnowledgeSearchIdx.java
  kb-mcp/vector-service/src/main/java/com/kb/vector/repository/KnowledgeSearchIdxRepository.java
  kb-infra/init-db/backfill/backfill_search_idx.sql

修改：
  kb-mcp/vector-service/src/main/java/com/kb/vector/service/EmbedTaskConsumer.java
  kb-mcp/vector-service/src/main/resources/application.yml  (DB 配置)

DB 迁移（新增）：
  kb-infra/init-db/updates/022_search_idx_acl_fields.sql  ← 与 Task 1.2 合并
```

**实施步骤：**

1. **vector-service 接入 PG**：配置 `spring.datasource` 指向 kb_knowledge（DB 用户 `kb_vector`，已在 019 授权）。
2. **`SearchIndexWriter.upsert(...)`** 入参为 EmbedTaskMessage 内容，SQL 采用：
   ```sql
   INSERT INTO kb_knowledge.knowledge_search_idx
     (tenant_id, doc_id, version, chunk_seq, title, text_snippet, keywords,
      doc_length, lang, tokens,
      sec_level, perm_group_id, effective_to, region_code)
   VALUES (:tid, :did, :ver, :seq, :title, :text, :kw,
           :len, :lang,
           to_tsvector('simple', :text || ' ' || coalesce(:kw,'')),
           :sec, :pg, :etTo, :rc)
   ON CONFLICT (tenant_id, doc_id, version, chunk_seq) DO UPDATE
     SET text_snippet = EXCLUDED.text_snippet,
         keywords = EXCLUDED.keywords,
         tokens = EXCLUDED.tokens,
         doc_length = EXCLUDED.doc_length,
         sec_level = EXCLUDED.sec_level,
         perm_group_id = EXCLUDED.perm_group_id,
         effective_to = EXCLUDED.effective_to,
         region_code = EXCLUDED.region_code,
         updated_at = now();
   ```
3. **写入顺序固定为 "PG 先、Milvus 后"**（见 §3.3 数据一致性原则）：
   ```java
   // EmbedTaskConsumer.consume(EmbedTaskMessage msg)
   try {
     searchIndexWriter.upsert(msg);     // 步骤 A：PG (可重试)
     milvusService.upsert(msg);         // 步骤 B：Milvus (失败抛出 → Kafka 重投)
   } catch (Exception e) {
     metrics.counter("embed_task.failed", "stage",
         e instanceof SearchIndexException ? "search_idx" : "milvus").increment();
     throw e;  // at-least-once 重投
   }
   ```
4. **回填脚本** `backfill_search_idx.sql`：从 `knowledge_clean` 表读已存在的 chunk，按 tenantId 分批写入 search_idx；带 `--limit / --tenant` 参数；可重入。

**验收方法：**

- ✅ 单测：`SearchIndexWriterTest`，覆盖 upsert/冲突路径/失败抛出。
- ✅ 集成：上传一份新文档，等待 30s 内 `SELECT count(*) FROM knowledge_search_idx WHERE doc_id=?` > 0。
- ✅ 一致性：上传 100 个文档后跑 `select count(*) from knowledge_clean ≈ count(*) from knowledge_search_idx`，允许 < 1% 差距（Milvus 失败重投未完）。
- ✅ 回填：对一个 tenant 跑回填脚本，再次比对一致性 > 99.9%。

**回滚方法：**

- 关闭 `app.search-index.write-enabled=false`（默认 true）→ `SearchIndexWriter.upsert` 直接 return。
- 表里多余的数据不需要清理，rag-service 这一侧 `app.bm25.enabled=false` 即可绕开。

---

### 2.2 Task 1.2 — 三表 ACL 字段补齐（**最关键安全修复**）

**风险等级：** 🔴 P0（越权风险）

**背景：** `knowledge_search_idx` / `knowledge_structured` / `faq_knowledge` 三表均无 `sec_level / perm_group_id / effective_to`。当前 [MilvusSearchService.filterByAcl](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/MilvusSearchService.java#L166) 仅依赖结果对象上的 ACL 字段做 post-filter — 非 Milvus 通道的结果这些字段为 0/null，要么误杀要么越权。

**改动范围：**

```
DB 迁移（新增）：
  kb-infra/init-db/updates/022_search_idx_acl_fields.sql
  kb-infra/init-db/updates/023_faq_knowledge_acl_fields.sql
  kb-infra/init-db/updates/024_structured_acl_view.sql

修改：
  kb-mcp/vector-service/src/main/java/com/kb/vector/service/SearchIndexWriter.java  (字段映射)
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/FaqService.java                (查询时带 ACL)
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/KeywordFallbackService.java    (查 view)
  contracts/kafka-schemas/embed-task-message.json                                    (确保 ACL 字段必传)
```

**实施步骤：**

1. **`022_search_idx_acl_fields.sql`**：
   ```sql
   BEGIN;
   ALTER TABLE kb_knowledge.knowledge_search_idx
     ADD COLUMN IF NOT EXISTS sec_level     INT         NOT NULL DEFAULT 5,
     ADD COLUMN IF NOT EXISTS perm_group_id BIGINT      NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS effective_to  VARCHAR(16) NOT NULL DEFAULT '',
     ADD COLUMN IF NOT EXISTS region_code   VARCHAR(32) NOT NULL DEFAULT '';
   CREATE INDEX IF NOT EXISTS idx_search_idx_acl
     ON kb_knowledge.knowledge_search_idx (tenant_id, perm_group_id, sec_level);
   COMMIT;
   ```
   **DEFAULT 5/0 是"保守值"**：默认最高密级 + 默认 perm_group=0（无人匹配）。回填脚本必须把真实值填上，否则历史数据全部检索不到（这是优于"全部可见"的失败模式）。

2. **`023_faq_knowledge_acl_fields.sql`**：FAQ 表加同样字段；另加 `embedding_model VARCHAR(64) DEFAULT 'BGE-zh-v1.5'`，用于模型升级后失效检测。

3. **`024_structured_acl_view.sql`**：`knowledge_structured` 不直接加字段（避免 kb-doc-processor 改动），改建只读 view，**join knowledge_doc 拿 sec_level/perm_group_id**：
   ```sql
   CREATE OR REPLACE VIEW kb_knowledge.v_knowledge_structured_acl AS
   SELECT s.tenant_id, s.doc_id, s.version, s.json_body,
          d.sec_level, d.perm_group_id, d.effective_to, d.region_code
   FROM kb_knowledge.knowledge_structured s
   JOIN kb_knowledge.knowledge_doc d
     ON s.tenant_id=d.tenant_id AND s.doc_id=d.doc_id;
   GRANT SELECT ON kb_knowledge.v_knowledge_structured_acl TO kb_rag;
   ```

4. **回填脚本**：Task 1.1 的回填脚本要带上 ACL 字段（从 `knowledge_doc` 或 `knowledge_version` join 取）。

5. **rag-service 修改**：
   - `Bm25SearchService.search` 的 SQL 改为返回 ACL 字段（`SELECT ... sec_level, perm_group_id, effective_to`）；填入 `Bm25SearchResult` 的对应字段（新增）。
   - `KeywordFallbackService.matchClause` 查 view 而不是表，返回带 ACL 的 hits。
   - `FaqService.match` 在比对相似度前先按 `sec_level <= userSecLevel AND perm_group_id in (...)` 过滤候选。
   - `ChatServiceImpl` 把所有通道返回的结果**强制走 `filterByAcl`**，不区分通道来源。

**验收方法：**

- ✅ 单测 `AclEnforcementTest`：构造一个 sec_level=4 的 chunk，用 userSecLevel=2 的用户查 → 不在结果中（覆盖 BM25 / Structured / FAQ 三条路径）。
- ✅ 集成测试：构造同 query 在两个不同 user（不同 perm_group_ids）下 → 结果集不应有重叠。
- ✅ 安全回归：跑一遍渗透用例集（计划写到 `kb-mcp/rag-service/src/test/resources/acl-cases.json`）。
- ✅ ArchUnit 新规则：`com.kb.rag.service.retrieval.channel.*` 包内所有 `@Query` 必须包含 `:tenantId` 参数。

**回滚方法：**

- DROP COLUMN 风险大，**不回滚 DDL**；rag-service 端用 feature flag `app.acl.strict-mode=false` 临时把 ACL 检查放宽到只查 docAcl 表（保留原有 [AclVerificationService](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/AclVerificationService.java) 兜底）。
- 默认 `strict-mode=true` 必须开。

---

### 2.3 Task 1.3 — 修 ClauseMatch 死代码（最小改动版）

**风险等级：** 🟠 P0（功能缺失）

**背景：** [ChatServiceImpl.java:293-294](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java#L293-L294) `clauseMatch` 计算后从未使用。

**改动范围：**

```
修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/KeywordFallbackService.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/repository/KnowledgeStructuredRepository.java
```

**实施步骤（最小侵入版，不引入新通道架构）：**

1. `KeywordFallbackService.matchClause` 改为查 §2.2 建好的 view，返回带 ACL + chunk_seq 的命中。
2. `ChatServiceImpl.buildPipelineContext` 中：
   - Step 5 拿到 `clauseMatch` 后，构造一组 `MilvusSearchResult`（chunk_seq 取 0 或 sectionPath 对应的最近 chunk，可由 vector-service 维护一张 `knowledge_structured_chunk_map` 辅助表）。
   - 把这组 hits **强制插入到 `combinedResults` 的前 N 位**（rank=1 优先），并给定 `vectorScore = 0.99`。
   - rerank 仍可能把它打下来，这是允许的（最终质量由 rerank 决定）；fusion 不在最小版做。
3. trace 标记 `clauseMatched=true`、`clauseRefs=[...]`。

**注意：** 这是过渡方案，等 Sprint 3 引入 `StructuredChannel` 后这段逻辑下沉到通道里。最小版直接撕进 ChatServiceImpl 是为了**让 Sprint 1 就能立即受益**，不阻塞主流程。

**验收方法：**

- ✅ 集成测试：`第32条规定了什么` query，Top1 citation 一定属于含 `section_path=32` 的文档。
- ✅ 不劣化：在 50 条普通语义 query 上 Recall@5 不下降。

**回滚方法：**

- `app.clause-fast-path.enabled=false` → 跳过该分支，行为完全等同 Sprint 1 之前。

---

### 2.4 Task 1.4 — Fusion Key 加 version

**风险等级：** 🟡 P0（隐性 bug）

**背景：** [RRFFusionService.buildKey](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/RRFFusionService.java#L103) 当前 `docId|chunkSeq` 不带 version。文档版本切换期间，BM25 返回 v3 / Dense 返回 v5 会被错误合并。

**改动范围：**

```
修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/RRFFusionService.java  (buildKey)
  kb-mcp/rag-service/src/main/java/com/kb/rag/dto/Bm25SearchResult.java       (确保 version 字段已有)
  kb-mcp/rag-service/src/main/java/com/kb/rag/dto/MilvusSearchResult.java     (同上)
```

**实施步骤：**

```java
private String buildKey(String docId, int version, int chunkSeq) {
    return docId + "|" + version + "|" + chunkSeq;
}
```

`fuse(...)` 中所有 `buildKey` 调用相应改造。

**验收方法：** 单测 `RRFFusionServiceTest` 增加用例：同 docId / 同 chunkSeq / 不同 version 的两条 hit 应该是两条独立 FusedResult。

**回滚方法：** 改回原 buildKey 即可。低风险无副作用。

---

## 3. Sprint 2：P0 通道归因 + 异常分级（Week 2，不阻塞）

### 3.1 Task 2.1 — 通道归因字段透出

**风险等级：** 🟡 P1（评测前置）

**背景：** trace.hit_docs / Citation 当前不区分召回来源，A/B 评测和 §13 故障排查都缺这层。

**改动范围：**

```
新增：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/attribution/ChannelAttribution.java
  kb-infra/init-db/updates/025_rag_trace_channel_attribution.sql

修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/dto/CitationDto.java                      (新增 sourceChannels)
  kb-mcp/rag-service/src/main/java/com/kb/rag/dto/ChatResponse.java                     (新增 channelStats)
  kb-mcp/rag-service/src/main/java/com/kb/rag/entity/RagPipelineTrace.java              (新增 channelHits)
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/PipelineTraceService.java         (写 channelHits)
  contracts/openapi/rag-service-v1.yaml                                                  (optional 字段)
  kb-portal/web/src/types/index.ts                                                       (类型扩展)
```

**实施步骤：**

1. `025_rag_trace_channel_attribution.sql`：
   ```sql
   ALTER TABLE kb_audit.rag_pipeline_trace
     ADD COLUMN IF NOT EXISTS channel_hits JSONB NOT NULL DEFAULT '{}'::jsonb;
   ```
2. `CitationDto.sourceChannels: Set<String>`，可选字段，默认空集合（向后兼容）。
3. 在最小修复版（Sprint 1）里就埋点：BM25 hit 标 `["SPARSE"]`，Milvus hit 标 `["DENSE"]`，clauseMatch 标 `["STRUCTURED"]`，FAQ 标 `["FAQ"]`。
4. `PipelineTraceService.finish` 写入 `channel_hits = { DENSE: 50, SPARSE: 32, ... }`。

**验收：** trace 详情接口能查到每个 citation 的 sourceChannels；DB 字段非空。

**回滚：** 字段是可选 / 默认值，无需特殊回滚。

---

### 3.2 Task 2.2 — 通道异常分级（fail-close vs fail-open）

**风险等级：** 🟠 P0（可用性）

**约定（与 [hybrid-retrieval.md §5.2.2](hybrid-retrieval.md) 配套补强）：**

| 通道 | 失败语义 | 触发后行为 |
|---|---|---|
| DENSE | **fail-close** | 标记 `result=NO_MATCH`、`refusal_reason=DENSE_UNAVAILABLE`；不允许用其它通道凑数 |
| SPARSE | fail-open | 跳过该通道，trace 记 `channels.SPARSE.status=DEGRADED` |
| STRUCTURED | fail-open | 同上 |
| METADATA | fail-open | 同上 |
| FAQ | fail-open | 同上 |

**为什么 DENSE fail-close：** 没有 DENSE，意味着语义召回完全瘫痪；BM25 + FAQ + STRUCTURED 拼起来的结果在通用 query 上质量极差（关键词命中 + 高频 FAQ + 死规则），用户拿到的是错答案而不是"没答案"，体验更糟。

**改动范围：**

```
新增：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/ChannelExecutionResult.java

修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/RefusalService.java
```

**实施步骤：**

1. `ChannelExecutionResult` 携带 `successfulChannels: Set<ChannelId>`、`failedChannels: Map<ChannelId, String>`（reason）。
2. ChatServiceImpl 在 retrieve 阶段后判断：
   ```java
   if (!result.successfulChannels.contains(ChannelId.DENSE)) {
       trace.setRefusalReason("DENSE_UNAVAILABLE");
       trace.setResult("NO_MATCH");
       return buildNoMatchResponse(...);
   }
   ```
3. `RefusalService` 新增 reason 枚举：`DENSE_UNAVAILABLE`，话术与 `NO_MATCH` 相同但便于运维区分。

**验收：** 集成测试关闭 Milvus 端口模拟 DENSE 挂 → 接口返回 NO_MATCH，trace.failedChannels 含 DENSE，**响应在 1s 内**（不能等其它通道）。

**回滚：** `app.retrieval.dense-fail-close=false` 临时回退到当前行为（出现部分降级）。

---

### 3.3 Task 2.3 — Milvus / PG Reconcile Job

**风险等级：** 🟠 P1（数据一致性）

**背景：** Milvus 不支持分布式事务。Task 1.1 选择"PG 先、Milvus 后"，保证 Milvus 有 → PG 一定有；但 PG 有 → Milvus 可能没有。

**改动范围：**

```
新增：
  kb-mcp/vector-service/src/main/java/com/kb/vector/job/ReconcileJob.java
  kb-mcp/vector-service/src/main/java/com/kb/vector/service/MilvusInventoryService.java  (按 tenant 列 chunk 清单)
  kb-infra/init-db/updates/026_reconcile_log.sql
```

**实施步骤：**

1. `026_reconcile_log.sql`：
   ```sql
   CREATE TABLE IF NOT EXISTS kb_audit.reconcile_log (
     id BIGSERIAL PRIMARY KEY,
     tenant_id VARCHAR(64) NOT NULL,
     run_at TIMESTAMP NOT NULL DEFAULT now(),
     pg_count BIGINT, milvus_count BIGINT,
     missing_in_milvus BIGINT, missing_in_pg BIGINT,
     repaired_to_milvus BIGINT, repaired_to_pg BIGINT,
     duration_ms BIGINT, error_message TEXT
   );
   ```
2. `ReconcileJob.run()` 每小时跑一次（`@Scheduled(cron="0 17 * * * *")`，错峰避开整点）：
   - 按 tenant 分页拉 PG `knowledge_search_idx` 的 `(doc_id, version, chunk_seq)` 集合
   - 按 tenant 查 Milvus `(doc_id, version, chunk_seq)` 集合
   - 差集 1：PG 有 Milvus 没 → 发 `embed-task` topic 重新处理
   - 差集 2：Milvus 有 PG 没 → 调 SearchIndexWriter 补写 PG（理论不应发生，因为 PG 是先写的；若发生说明数据库回滚或人为删除，告警人工介入）
   - 写 reconcile_log
3. 限速：单次最多修复 1000 条；超阈值发告警停手。

**验收：**
- ✅ 手动制造不一致（删 Milvus 某条 chunk）→ 1 小时内自动修复。
- ✅ reconcile_log 表有记录；连续 24 小时无 `missing_in_milvus > 100`。

**回滚：** `app.reconcile.enabled=false`；表保留，job 不运行。

---

## 4. Sprint 3：P1 多路框架（Week 3-4，feature flag）

### 4.1 Task 3.1 — QueryPlanner

**风险等级：** 🟠

**改动范围：**

```
新增：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/QueryPlanner.java       (接口)
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/LlmQueryPlanner.java    (主实现)
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/RuleQueryPlanner.java   (降级实现)
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/RetrievalPlan.java       (record)

修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/LlmQueryRewriteService.java       (升级 prompt)
  kb-mcp/rag-service/src/main/java/com/kb/rag/dto/LlmRewriteResponse.java                (增 queryType, tagFilters)
```

**实施步骤：**

1. **接口定义**（详见 [hybrid-retrieval.md §5.2.1](hybrid-retrieval.md)）。
2. `LlmQueryPlanner.plan()`：
   - 调用升级后的 LLM rewrite，**1.5s 硬超时**
   - 校验输出：sub_queries 长度 [3,80]、与 main_query 字符相似度 < 0.95；不通过的项静默丢弃
   - 失败 / 超时 / 输出非法 → 抛 `PlannerLlmException`
3. `RuleQueryPlanner.plan()` 降级实现：
   - rewrittenQuery：复用 `synonymExpand`
   - subQueries：`[rewrittenQuery]`
   - clauseRefs：复用 `CLAUSE_PATTERN / WESTERN_CLAUSE_PATTERN`
   - tagFilters / chunkTypeFilter：空
   - queryType：根据 rule 启发式（含"如何""怎么" → PROCEDURE；含条款编号 → POLICY_QA；其它 → OTHER）
4. `QueryPlannerFacade.plan()` 包一层熔断（见 §5.1 Task 4.1）。

**验收：**
- ✅ 单测覆盖：正常路径 / LLM 超时 / LLM 返回非法 JSON / sub_queries 校验 / queryType 分类
- ✅ 在 50 条典型 query 上手工评估 queryType 分类准确率 ≥ 85%

---

### 4.2 Task 3.2 — RetrievalChannel + 三通道实现

**改动范围：**

```
新增：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/channel/RetrievalChannel.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/channel/ChannelHit.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/channel/DenseChannel.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/channel/SparseChannel.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/channel/StructuredChannel.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/channel/FaqChannel.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/ChannelExecutor.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/config/ChannelExecutorConfig.java
```

**实施步骤：**

1. **`DenseChannel`** 包装 `MilvusSearchService`：
   - **暂不开启 subQuery 并发**（等 embedding batch 接口，§5.2 Task 4.2）；`sub-query-max=1` 起步
   - 内部支持参数 `subQueryEnabled=false`；接口准备好但不投入
2. **`SparseChannel`** 包装 `Bm25SearchService`，SQL 改成 `ts_rank_cd`，并按 `doc_length` 归一：
   ```sql
   SELECT ..., ts_rank_cd(tokens, plainto_tsquery('simple', :q)) /
               (1 + log(greatest(doc_length, 1) / 500.0)) AS score
   ```
3. **`StructuredChannel`** 取代 §2.3 的过渡逻辑；落到 view `v_knowledge_structured_acl`。
4. **`FaqChannel`** 暴露 `matchShortcut()` 和 `matchForFusion()` 两个语义：
   - score ≥ 0.95 → matchShortcut 直接短路（保留现状路径）
   - 0.85 ≤ score < 0.95 → matchForFusion 返回 List<ChannelHit>，进入融合
5. **`ChannelExecutor`** 用专属 `ThreadPoolTaskExecutor`：
   ```java
   @Bean("channelPool")
   public ThreadPoolTaskExecutor channelPool() {
     var p = new ThreadPoolTaskExecutor();
     p.setCorePoolSize(Runtime.getRuntime().availableProcessors() * 2);
     p.setMaxPoolSize(p.getCorePoolSize() * 4);
     p.setQueueCapacity(0);                                // 不排队
     p.setRejectedExecutionHandler(new CallerRunsPolicy()); // 主线程兜底执行
     p.setThreadNamePrefix("channel-");
     return p;
   }
   ```
   超时：每通道独立 timeout（500/300/200/300/100ms），用 `CompletableFuture.completeOnTimeout` 包装；超时后该通道返回空 + 标 DEGRADED。

**ACL 强制约束：** 所有通道的 SQL / Milvus 调用必须**带 tenantId 参数**；新增 ArchUnit 规则守护：

```java
@Test
void allRetrievalChannelQueriesMustContainTenantId() {
    classes()
      .that().resideInAPackage("com.kb.rag.service.retrieval.channel..")
      .and().areAnnotatedWith(Repository.class)
      .should().haveOnlyMethodsWithParametersNamed("tenantId", "tid", "tenant_id")
      .check(importedClasses);
}
```

**验收：**
- ✅ 各通道单测覆盖：正常 / topK=0 / 异常 / 超时
- ✅ ArchUnit 规则跑通
- ✅ 集成：模拟单通道挂（kill Bm25）→ 其它通道正常返回

---

### 4.3 Task 3.3 — HybridFusionService（含部分失败归一）

**风险等级：** 🟠

**改动范围：**

```
新增：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/fusion/HybridFusionService.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/fusion/FusedHit.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/fusion/ZScoreNormalizer.java

弃用：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/RRFFusionService.java   (@Deprecated)
```

**核心算法（已纳入 §1.2.2 边界修正）：**

```java
public List<FusedHit> fuse(Map<ChannelId, List<ChannelHit>> perChannel,
                           RetrievalPlan plan,
                           Set<ChannelId> successfulChannels) {

  // 1. 通道权重归一（部分失败时让和等于1）
  double weightSum = successfulChannels.stream()
      .mapToDouble(c -> channelWeight(plan, c)).sum();

  // 2. 每通道 z-norm（≥3 hits 才做；不足时 fallback min-max；空通道跳过）
  Map<ChannelId, Function<Double,Double>> normalizers = new EnumMap<>(ChannelId.class);
  perChannel.forEach((cid, hits) -> {
    if (hits.size() >= 3) normalizers.put(cid, ZScoreNormalizer.fit(hits));
    else if (!hits.isEmpty()) normalizers.put(cid, MinMaxNormalizer.fit(hits));
    else normalizers.put(cid, x -> 0.0);
  });

  // 3. 聚合（fusion key 含 version，复用 Task 1.4 改动）
  Map<String, Accumulator> acc = new LinkedHashMap<>();
  perChannel.forEach((cid, hits) -> {
    if (!successfulChannels.contains(cid)) return;
    double w = channelWeight(plan, cid) / weightSum;
    int rrfK = rrfKForChannel(cid);  // DENSE/SPARSE=60, STRUCTURED/METADATA=10, FAQ=5
    for (ChannelHit h : hits) {
      String key = h.docId() + "|" + h.version() + "|" + h.chunkSeq();
      double rrf = 1.0 / (rrfK + h.rank());
      double normed = sigmoid(normalizers.get(cid).apply(h.rawScore()));
      acc.computeIfAbsent(key, k -> new Accumulator(h))
         .add(cid, h.rank(), h.rawScore(), w * (rrf + scoreNormWeight * normed));
    }
  });

  // 4. 多通道 boost：仅当 successfulChannels >= 3 才考虑
  if (successfulChannels.size() >= 3) {
    for (Accumulator a : acc.values()) {
      if (a.channelCount() >= 3) a.boost(multiChannelBoost);
    }
  }

  // 5. STRUCTURED rank=1 boost：按 matchedDocCount 衰减
  acc.values().stream()
     .filter(a -> a.rank(ChannelId.STRUCTURED) == 1)
     .forEach(a -> a.boost(structuredRank1Boost / Math.log(1 + plan.structuredMatchCount())));

  return acc.values().stream()
      .map(Accumulator::toFusedHit)
      .sorted(comparingDouble(FusedHit::fusionScore).reversed())
      .toList();
}
```

**关键改动相对 hybrid-retrieval.md：**
- 通道权重按成功通道集合**归一**（避免分数随失败通道漂移）
- z-norm 样本不足时降级 min-max
- 多通道 boost 仅在 ≥3 通道都成功时生效
- STRUCTURED boost 按命中文档数衰减

**验收：**
- ✅ 单测：构造 z-norm 边界 / 单通道 / 双通道 / 三通道 / Structured 不同 matchCount 场景
- ✅ Property test：fusionScore 单调（同 rank、同 rawScore 不应出现 score 颠倒）
- ✅ A/B 离线：在 100 条 golden set 上 Recall@5 不低于现状 RRF

---

### 4.4 Task 3.4 — MmrDiversitySelector

**改动范围：**

```
新增：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/diversity/MmrDiversitySelector.java
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/diversity/CharTrigramJaccard.java
```

**实施步骤：**

1. rerank top-k 改 5 → 10（配 `app.rerank.final-top-k=10`）
2. `MmrDiversitySelector.select(reranked, queryVec, topN=5)`：
   - parent-collapse：同 parent_ref 仅留 rerank 最高分（短文本边界 fallback：text 长度 < 30 字 时退化为 docId 相同视为重复）
   - MMR 迭代：λ=0.7
3. ChatServiceImpl 串入：rerank → MMR → ACL_verify → parent_lookup（注意顺序）

**验收：**
- ✅ 单测：5 条都来自同 parent → collapse 后输出 1 条；引用扎堆场景输出多样
- ✅ 集成：手工 query 检查 5 条 citation 的 parent_ref 至少 4 种

---

## 5. Sprint 4：P1 兜底机制 + 灰度（Week 5）

### 5.1 Task 4.1 — LLM Planner Circuit Breaker

**风险等级：** 🟠

**改动范围：**

```
新增依赖：
  io.github.resilience4j:resilience4j-spring-boot3

新增：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/QueryPlannerFacade.java

修改：
  kb-mcp/rag-service/src/main/resources/application.yml  (resilience4j config)
```

**配置：**

```yaml
resilience4j:
  circuitbreaker:
    instances:
      llmPlanner:
        slidingWindowSize: 20
        failureRateThreshold: 50
        waitDurationInOpenState: 60s
        permittedNumberOfCallsInHalfOpenState: 3
        slowCallRateThreshold: 50
        slowCallDurationThreshold: 1500ms
```

**`QueryPlannerFacade.plan()`：**

```java
@CircuitBreaker(name="llmPlanner", fallbackMethod="ruleFallback")
public RetrievalPlan plan(String tid, String q, List<Turn> h) {
    return llmQueryPlanner.plan(tid, q, h);
}

private RetrievalPlan ruleFallback(String tid, String q, List<Turn> h, Throwable t) {
    metrics.counter("rag.planner.fallback").increment();
    return ruleQueryPlanner.plan(tid, q, h);
}
```

**验收：** 故障注入：连续 N 次 LLM 调用强制超时 → breaker 转 OPEN，60s 内全部走规则降级。

---

### 5.2 Task 4.2 — embedding-service Batch 接口（联动）

**风险等级：** 🟠（跨服务）

**背景：** subQuery 并发依赖 batch。`embedding-service` 当前接口 `POST /embeddings` 单 query 单调用，500ms 内串行 3 个无法满足。

**改动范围：**

```
embedding-service（外部仓库 / 独立服务）：
  POST /embeddings/batch  body: { "queries": [...] }

修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/EmbeddingServiceClient.java  (新增 embedBatch)
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/channel/DenseChannel.java
```

**实施步骤：**

1. **协调 embedding-service 团队**新增 `/embeddings/batch` 接口（如果不在我方代码库内）。
2. `EmbeddingServiceClient.embedBatch(List<String>)`：失败时降级为 N 次单 embed 调用 + 串行。
3. DenseChannel 把 main_query + sub_queries 合成一次 batch 调用，每个 sub 独立 search Milvus（Milvus 调用本就并发）；按 docId 取 rank 最小值（max-pool）。
4. 启用 `app.retrieval.channels.dense.sub-query-max=3` 配置。

**风险与降级：**
- 如果 embedding-service 短期内无法上线 batch → 保持 `sub-query-max=1`，DenseChannel 仅用 main_query，**不阻塞其它任务**。
- batch 接口出问题 → 回退到 N 次单调用并行（线程池）。

**验收：**
- ✅ batch 接口正确性 P0
- ✅ 端到端：DenseChannel sub-query 并发后 P95 < 500ms

---

### 5.3 Task 4.3 — Rerank Fallback + 拒答阈值

**风险等级：** 🟡

**背景：** [ChatServiceImpl.java:404-415](../../kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java#L404-L415) 现有 fallback 把所有 vectorScore 强制改成 minScore (默认 0.3)，**会让 LOW_CONFIDENCE 永远不触发**。

**改动范围：**

```
修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java  (rerank catch)
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/RefusalService.java   (阈值动态)
```

**实施步骤：**

1. rerank fallback 时**不改 vectorScore**，保留 fusion 原分数。
2. RefusalService 增加参数 `rerankAvailable`：rerank 失败时阈值 +0.2（更保守）。
3. trace 写入 `rerankFallback=true`。

**验收：** 关闭 rerank-service → query 仍能返回；trace 标记 rerankFallback，confidence 阈值临时提升。

---

### 5.4 Task 4.4 — 灰度切流

**风险等级：** 🟠

**改动范围：**

```
修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java  (路由)
  kb-mcp/rag-service/src/main/resources/application.yml                      (rollout-percent)
```

**实施步骤：**

1. `app.retrieval.rollout-percent: 0`（启动时默认 0%，全部走老链路）。
2. ChatServiceImpl 入口判断：
   ```java
   int bucket = Math.floorMod(request.getTenantId().hashCode() + request.getSessionId().hashCode(), 100);
   boolean useHybrid = bucket < rolloutPercent;
   ```
   按 (tenantId, sessionId) 复合 hash 分桶，保证同会话稳定走同一链路。
3. trace 写入 `rolloutVariant: HYBRID | LEGACY`。
4. 灰度节奏：1% → 10% → 50% → 100%，每阶段观察 ≥ 24h。回滚条件见 §12。

**验收：** rollout-percent=10% 时 trace 表里 HYBRID variant 占比约 10%；多个会话内同 sessionId 始终一致。

---

### 5.5 Task 4.5 — 可观测指标

**改动范围：**

```
修改：
  kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/**/* (埋 Micrometer)
  kb-infra/grafana/dashboards/rag-hybrid-retrieval.json  (新增 dashboard)
```

**必须埋的指标清单：**

```
rag_channel_latency_seconds        {channel, result}   Timer
rag_channel_hits                   {channel}           DistributionSummary
rag_channel_timeout_total          {channel}           Counter
rag_channel_failed_total           {channel, reason}   Counter
rag_fusion_successful_channels     {count}             Counter
rag_fusion_partial_failure_total                       Counter
rag_planner_fallback_total                             Counter
rag_planner_circuit_open_total                         Counter
rag_rerank_fallback_total                              Counter
rag_refusal_total                  {reason}            Counter
rag_rollout_variant                {variant}           Counter
rag_acl_filter_dropped_total       {channel}           Counter
rag_reconcile_missing_in_milvus    {tenant}            Gauge
```

**Grafana 仪表板：**
- Row 1: P50/P95/P99 总延迟（按 variant 分）
- Row 2: 每通道 P95 延迟 + timeout rate
- Row 3: 通道失败数 + circuit breaker 状态 + planner fallback rate
- Row 4: refusal_reason 分布 + ACL drop 数 + reconcile 一致性

**告警规则：**

```yaml
- alert: HybridRetrievalDenseFailureHigh
  expr: rate(rag_channel_failed_total{channel="DENSE"}[5m]) > 0.1
  severity: critical
- alert: HybridRetrievalPlannerCircuitOpen
  expr: increase(rag_planner_circuit_open_total[5m]) > 0
  severity: warning
- alert: HybridRetrievalRefusalSpike
  expr: rate(rag_refusal_total[5m]) > 2 * avg_over_time(rate(rag_refusal_total[5m])[1h:5m])
  severity: warning
- alert: ReconcileLagHigh
  expr: rag_reconcile_missing_in_milvus > 100
  severity: warning
```

---

## 6. Sprint 5：P2 增强（Week 6+，可选）

延后到主链路稳定后再启动；本节仅给出 stub。

### 6.1 MetadataChannel
- 输入：tagFilters + chunkTypeFilter
- Milvus query 不带向量，仅 filter
- topK=20，timeout=300ms
- feature flag：`app.retrieval.channels.metadata.enabled`

### 6.2 ChannelWeightProvider（学习权重）
- 数据源：rag_feedback + pipeline_trace.channelHits join
- 离线训：每周一跑 Logistic Regression，输出 (queryType × channel) → weight
- 上线门槛：必须在 golden set 回归测试通过；用 A/B 验证 ≥ 7 天

### 6.3 Milvus 2.5 Sparse Vector
- 评估升级路径
- 若可行，SparseChannel 整体下沉到 Milvus，删除 `knowledge_search_idx` 表

---

## 7. 配置项总表

> 完整列表，按生效阶段标注。`_default` 表示该配置在该 Sprint 默认值。

```yaml
app:
  # ----- Sprint 1 -----
  bm25:
    enabled: ${RAG_BM25_ENABLED:true}
    top-k: 50
  clause-fast-path:
    enabled: ${RAG_CLAUSE_FAST_PATH_ENABLED:true}     # Sprint 1 默认 true

  # ----- Sprint 2 -----
  acl:
    strict-mode: ${RAG_ACL_STRICT:true}               # 必须 true
  retrieval:
    dense-fail-close: ${RAG_DENSE_FAIL_CLOSE:true}
  reconcile:
    enabled: ${RECONCILE_ENABLED:true}

  # ----- Sprint 3 ------
  retrieval:
    rollout-percent: ${RAG_ROLLOUT_PERCENT:0}         # 灰度起点
    plan:
      llm-enabled: ${RAG_PLANNER_LLM_ENABLED:true}
      llm-timeout-ms: 1500
      cache-ttl-minutes: 30
    channels:
      dense:
        enabled: true
        top-k: 50
        sub-query-max: ${RAG_DENSE_SUB_QUERY_MAX:1}   # 等 embedding batch 上线后改 3
        timeout-ms: 500
      sparse:
        enabled: true
        top-k: 50
        score-fn: ts_rank_cd
        timeout-ms: 300
      structured:
        enabled: true
        top-k: 5
        timeout-ms: 200
      metadata:
        enabled: false                                # Sprint 5
        top-k: 20
        timeout-ms: 300
      faq:
        enabled: true
        shortcut-threshold: 0.95
        fusion-threshold: 0.85
        top-k: 3
        timeout-ms: 100
    fusion:
      rrf-k:
        dense: 60
        sparse: 60
        structured: 10
        metadata: 10
        faq: 5
      score-norm-weight: 0.3
      multi-channel-boost: 0.10
      structured-rank1-boost: 0.50
      use-learned-weights: false                       # Sprint 5
    diversity:
      enabled: true
      mmr-lambda: 0.7
      parent-collapse: true
      pool-size: 10
    rerank:
      final-top-k: 10
      mmr-output-top-k: 5

  # ----- Sprint 4 -----
resilience4j:
  circuitbreaker:
    instances:
      llmPlanner:
        slidingWindowSize: 20
        failureRateThreshold: 50
        waitDurationInOpenState: 60s
```

**回滚总开关**（一行命令）：

```bash
# 完全退回 Sprint 1 之前的行为
kubectl set env deploy/rag-service \
  RAG_ROLLOUT_PERCENT=0 \
  RAG_BM25_ENABLED=false \
  RAG_CLAUSE_FAST_PATH_ENABLED=false
```

---

## 8. 接口契约改动总览

### 8.1 OpenAPI 改动（contracts/openapi/rag-service-v1.yaml）

新增 schema 字段（全部 optional）：

```yaml
Citation:
  properties:
    sourceChannels:
      type: array
      items: { type: string, enum: [DENSE, SPARSE, STRUCTURED, METADATA, FAQ] }
    channelRanks:
      type: object
      additionalProperties: { type: integer }

ChatResponse:
  properties:
    searchMode:
      type: string
      enum: [DENSE, SPARSE, HYBRID, STRUCTURED_FAST, FAQ]
    channelStats:
      type: object
      additionalProperties: { type: integer }
    rolloutVariant:
      type: string
      enum: [HYBRID, LEGACY]
```

### 8.2 embedding-service（外部）

新增 endpoint（与 embedding 团队联动）：

```yaml
POST /embeddings/batch
Body: { "queries": [string, ...], "max_batch": 8 }
Response: { "vectors": [[float, ...], ...] }
```

### 8.3 Kafka 契约（contracts/kafka-schemas/embed-task-message.json）

ACL 字段必须存在（之前可选，现在强制）：`sec_level, perm_group_id, effective_to, region_code`。下游 schema 校验启用 strict 模式。

---

## 9. 数据库迁移清单

按执行顺序：

| 迁移 | 用途 | Sprint | 可逆性 |
|---|---|---|---|
| `022_search_idx_acl_fields.sql` | 三表 ACL 字段 | 1 | 不可回滚 DDL |
| `023_faq_knowledge_acl_fields.sql` | FAQ ACL + embedding_model | 1 | 不可回滚 DDL |
| `024_structured_acl_view.sql` | knowledge_structured 视图 | 1 | DROP VIEW 可回滚 |
| `025_rag_trace_channel_attribution.sql` | trace.channel_hits | 2 | DROP COLUMN 可（保数据兼容） |
| `026_reconcile_log.sql` | reconcile_log 表 | 2 | DROP TABLE 可回滚 |
| `027_retrieval_channel_weight.sql` | 学习权重表 | 5 | DROP TABLE 可回滚 |

**回填脚本**：`kb-infra/init-db/backfill/backfill_search_idx.sql` —— Sprint 1 执行一次性回填。

---

## 10. 测试与验收

### 10.1 单元测试覆盖率门槛

| 包 | 行覆盖率 ≥ |
|---|---|
| `service.retrieval.*` | 80% |
| `service.retrieval.fusion.*` | 90% |
| `service.retrieval.channel.*` | 75% |

### 10.2 集成测试

```
src/test/java/com/kb/rag/it/
├── HybridRetrievalE2eTest.java        ← 全链路
├── ChannelFailureScenarioTest.java    ← 单通道挂场景矩阵 (5x5)
├── AclEnforcementTest.java            ← ACL 越权回归
├── ReconcileJobIT.java                ← 一致性修复
└── RolloutShardingTest.java           ← 灰度分桶稳定性
```

### 10.3 评测集（Golden Set）

在 §10.3 上线前必须准备：

```
src/test/resources/golden-set/
├── clause-queries.json     50 条条款编号 query
├── procedure-queries.json  50 条流程类
├── definition-queries.json 30 条定义类
└── chitchat-queries.json   20 条闲聊
```

每条标注：`ideal_doc_ids[]`、`ideal_chunk_seqs[]`、`acceptable_alt_doc_ids[]`、`should_refuse: bool`。

**离线评测脚本** `kb-infra/scripts/run_eval.py` 计算 Recall@1/3/5、MRR、nDCG。

### 10.4 验收门槛（每个 Sprint 完成时）

| Sprint | 指标 | 目标 |
|---|---|---|
| 1 | knowledge_search_idx 行数 / Milvus chunk 数 | ≥ 99% |
| 1 | ACL 渗透用例 | 0 越权 |
| 1 | 条款 query Recall@5 | ≥ 0.80 |
| 2 | DENSE 故障注入后接口 SLA | < 1s 返回 NO_MATCH |
| 2 | reconcile_log 24h 内 missing 数 | < 100 |
| 3 | golden set Recall@5（HYBRID variant） | ≥ LEGACY + 5% |
| 3 | P95 延迟 | < 2.5s |
| 4 | Circuit breaker 注入失败后 60s 内全降级 | ✅ |
| 4 | 灰度 10% 24h 错误率 | ≤ LEGACY |

---

## 11. 上线 Checklist

### 11.1 Sprint 1 上线（基础修复）

- [ ] `022/023/024` 迁移在 dev / staging 全跑通
- [ ] 回填脚本对 staging 全量数据成功
- [ ] vector-service 写双库（PG + Milvus）24h 无错误
- [ ] ACL 渗透测试通过
- [ ] knowledge_search_idx 行数与 Milvus 一致性 ≥ 99%
- [ ] ChatService 在 staging 上跑 50 条 query 无回归

### 11.2 Sprint 2 上线（归因 + 异常）

- [ ] `025/026` 迁移成功
- [ ] reconcile job 在 staging 跑 ≥ 1 个完整周期，log 表有记录
- [ ] DENSE 故障演练通过
- [ ] trace.channel_hits 字段写入正常

### 11.3 Sprint 3+4 上线（主体改造 + 灰度）

- [ ] 代码合入主干，`rollout-percent=0`
- [ ] Grafana dashboard 部署
- [ ] 告警规则就绪
- [ ] 灰度 1% （选 1 个 tenant）24h
- [ ] 灰度 10% 48h
- [ ] 灰度 50% 72h
- [ ] 灰度 100%（保留 LEGACY 代码路径 30 天）

### 11.4 Sprint 5（增强）

- [ ] golden set Recall@5 提升 ≥ 8%（相对 Sprint 3 上线时）
- [ ] 用户反馈 DISLIKE 率下降

---

## 12. 回滚预案

| 故障级别 | 表现 | 操作 | 影响 |
|---|---|---|---|
| L0 完全瘫痪 | 接口 5xx > 10% | `RAG_ROLLOUT_PERCENT=0` | 全部回 LEGACY，1 分钟生效 |
| L1 召回质量回退 | refusal_rate > 基线 + 50% | 灰度退一档（如 50→10%） | 部分用户回 LEGACY |
| L2 单通道异常 | rag_channel_failed{channel=X} 高 | 关该通道 `enabled=false` | 退化为其它通道，无需全回滚 |
| L3 Planner LLM 抖动 | planner_fallback rate > 50% | Circuit breaker 自动；运维确认 | 性能下降，召回质量略降 |
| L4 数据不一致 | reconcile missing > 1000 | 暂停 BM25 通道 + 加速 reconcile | SPARSE 通道关闭 |
| L5 ACL 越权告警 | acl_filter_dropped 反常 | **立即** `app.acl.strict-mode` 切到只查 docAcl 表的兜底 | 性能下降但安全 |

**严格禁止的"快速修复"：**
- ❌ 直接改数据库数据
- ❌ 关闭 ACL 检查
- ❌ 跳过 reconcile job
- ❌ 把 `rollout-percent` 直接拉到 100% 而不经灰度

---

## 13. 故障预案 (Runbook)

### 13.1 现象：用户报"什么都搜不到"

排查顺序：
1. 看 `rag_refusal_total{reason=*}` — 是 NO_MATCH 还是 NO_PERMISSION？
2. 若 NO_MATCH 飙高：
   - 查 `rag_channel_failed_total` — DENSE 是否在挂？
   - 查 Milvus `kbk_documents` collection 是否 loaded
   - 查 `embedding-service` 健康
3. 若 NO_PERMISSION 飙高：
   - 查 `rag_acl_filter_dropped_total{channel=*}` — 哪个通道在被滤干净？
   - 通常是 Task 1.2 后回填脚本没跑全 → 用 admin 接口手动重跑回填
4. 看 `rag_rollout_variant` 分布 — 是否两个 variant 都有问题？

### 13.2 现象：P95 延迟突增

1. 看每通道 P95 — 哪个慢
2. DENSE 慢 → 检查 Milvus `loadCollection` 是否抖动；embedding-service 是否慢
3. SPARSE 慢 → PG 连接池打满？看 `hikari_pool_pending`
4. PLANNER 慢 → LLM gateway 健康；如果是 LLM 拥塞 → 降低 LLM Planner 触发率（短 query 走规则）
5. 兜底：临时把 rollout-percent 拉低

### 13.3 现象：reconcile 持续报 missing_in_milvus 高

1. 查 `embed-task` topic lag — 是否消费堆积
2. 看 vector-service 日志 — Milvus upsert 是否失败
3. 手动跑回填脚本对该 tenant

### 13.4 现象：ACL 越权告警

**最高优先级**：
1. 立即 `app.retrieval.rollout-percent=0` 把流量切回 LEGACY（LEGACY 路径只查 Milvus，ACL 走 doc_acl 验证，相对安全）
2. 查 `rag_acl_filter_dropped` 反常的通道
3. 检查该通道是否在用 Task 1.2 的 ACL 字段
4. 若是回填未覆盖问题 → 紧急回填
5. 复盘并补单元测试

---

## 14. 改动文件清单总表

> 每行可直接对应一个 PR。

### 14.1 数据库（kb-infra/init-db/）

```
updates/022_search_idx_acl_fields.sql              ← Task 1.1+1.2 合并
updates/023_faq_knowledge_acl_fields.sql           ← Task 1.2
updates/024_structured_acl_view.sql                ← Task 1.2
updates/025_rag_trace_channel_attribution.sql      ← Task 2.1
updates/026_reconcile_log.sql                      ← Task 2.3
updates/027_retrieval_channel_weight.sql           ← Sprint 5
backfill/backfill_search_idx.sql                   ← Task 1.1
backfill/backfill_acl_fields.sql                   ← Task 1.2
```

### 14.2 vector-service

```
新增：
  src/main/java/com/kb/vector/service/SearchIndexWriter.java
  src/main/java/com/kb/vector/entity/KnowledgeSearchIdx.java
  src/main/java/com/kb/vector/repository/KnowledgeSearchIdxRepository.java
  src/main/java/com/kb/vector/service/MilvusInventoryService.java
  src/main/java/com/kb/vector/job/ReconcileJob.java
修改：
  src/main/java/com/kb/vector/service/EmbedTaskConsumer.java
  src/main/resources/application.yml
```

### 14.3 rag-service

```
新增（Sprint 3）：
  src/main/java/com/kb/rag/service/retrieval/QueryPlanner.java
  src/main/java/com/kb/rag/service/retrieval/QueryPlannerFacade.java
  src/main/java/com/kb/rag/service/retrieval/LlmQueryPlanner.java
  src/main/java/com/kb/rag/service/retrieval/RuleQueryPlanner.java
  src/main/java/com/kb/rag/service/retrieval/RetrievalPlan.java
  src/main/java/com/kb/rag/service/retrieval/ChannelExecutor.java
  src/main/java/com/kb/rag/service/retrieval/ChannelExecutionResult.java
  src/main/java/com/kb/rag/service/retrieval/channel/RetrievalChannel.java
  src/main/java/com/kb/rag/service/retrieval/channel/ChannelHit.java
  src/main/java/com/kb/rag/service/retrieval/channel/DenseChannel.java
  src/main/java/com/kb/rag/service/retrieval/channel/SparseChannel.java
  src/main/java/com/kb/rag/service/retrieval/channel/StructuredChannel.java
  src/main/java/com/kb/rag/service/retrieval/channel/MetadataChannel.java        (Sprint 5)
  src/main/java/com/kb/rag/service/retrieval/channel/FaqChannel.java
  src/main/java/com/kb/rag/service/retrieval/fusion/HybridFusionService.java
  src/main/java/com/kb/rag/service/retrieval/fusion/FusedHit.java
  src/main/java/com/kb/rag/service/retrieval/fusion/ZScoreNormalizer.java
  src/main/java/com/kb/rag/service/retrieval/fusion/ChannelWeightProvider.java  (Sprint 5)
  src/main/java/com/kb/rag/service/retrieval/diversity/MmrDiversitySelector.java
  src/main/java/com/kb/rag/service/retrieval/diversity/CharTrigramJaccard.java
  src/main/java/com/kb/rag/service/retrieval/attribution/ChannelAttribution.java
  src/main/java/com/kb/rag/config/ChannelExecutorConfig.java

修改：
  src/main/java/com/kb/rag/service/ChatServiceImpl.java                          (Sprint 1+3)
  src/main/java/com/kb/rag/service/MilvusSearchService.java                      (剥离为 DenseChannel 实现)
  src/main/java/com/kb/rag/service/Bm25SearchService.java                        (ts_rank_cd)
  src/main/java/com/kb/rag/service/KeywordFallbackService.java                   (查 view)
  src/main/java/com/kb/rag/service/FaqService.java                               (ACL 字段)
  src/main/java/com/kb/rag/service/RefusalService.java                           (rerank fallback 参数)
  src/main/java/com/kb/rag/service/PipelineTraceService.java                     (channelHits)
  src/main/java/com/kb/rag/service/LlmQueryRewriteService.java                   (升级 prompt)
  src/main/java/com/kb/rag/service/RRFFusionService.java                         (@Deprecated)
  src/main/java/com/kb/rag/dto/CitationDto.java
  src/main/java/com/kb/rag/dto/ChatResponse.java
  src/main/java/com/kb/rag/dto/Bm25SearchResult.java
  src/main/java/com/kb/rag/dto/LlmRewriteResponse.java
  src/main/java/com/kb/rag/entity/RagPipelineTrace.java
  src/main/resources/application.yml

删除（Sprint 3 完成 30 天后）：
  src/main/java/com/kb/rag/service/RRFFusionService.java
```

### 14.4 contracts

```
contracts/openapi/rag-service-v1.yaml                       (Sprint 2+3)
contracts/kafka-schemas/embed-task-message.json             (Sprint 1, ACL 字段必传)
```

### 14.5 kb-portal/web

```
src/types/index.ts                                          (新增 sourceChannels)
src/api/http-client.ts                                      (无须改)
src/app/rag/page.tsx                                        (通道徽章)
src/app/rag/trace/[traceId]/page.tsx                        (通道统计面板)
```

### 14.6 测试

```
新增：
  rag-service/src/test/java/com/kb/rag/service/retrieval/QueryPlannerTest.java
  rag-service/src/test/java/com/kb/rag/service/retrieval/channel/*Test.java
  rag-service/src/test/java/com/kb/rag/service/retrieval/fusion/HybridFusionServiceTest.java
  rag-service/src/test/java/com/kb/rag/service/retrieval/diversity/MmrDiversitySelectorTest.java
  rag-service/src/test/java/com/kb/rag/it/HybridRetrievalE2eTest.java
  rag-service/src/test/java/com/kb/rag/it/ChannelFailureScenarioTest.java
  rag-service/src/test/java/com/kb/rag/it/AclEnforcementTest.java
  rag-service/src/test/java/com/kb/rag/it/RolloutShardingTest.java
  rag-service/src/test/resources/golden-set/*.json
  vector-service/src/test/java/com/kb/vector/service/SearchIndexWriterTest.java
  vector-service/src/test/java/com/kb/vector/job/ReconcileJobIT.java

修改：
  rag-service/src/test/java/com/kb/rag/RagServiceArchTest.java   (新规则)
```

### 14.7 运维 / Infra

```
kb-infra/grafana/dashboards/rag-hybrid-retrieval.json
kb-infra/grafana/alerts/rag-hybrid-retrieval.yaml
kb-infra/scripts/run_eval.py
kb-infra/scripts/backfill_acl_fields.sh
```

---

## 附录 A：每个 Task 的 PR 模板

每个 Task 提 PR 时附带：

```markdown
## What
<改动说明，1-3 句>

## Why
<对应到本文档哪个 Task；为什么这么改>

## Risk
- [ ] 是否有 DB 迁移：…
- [ ] 是否触动 ACL：…
- [ ] 是否需要灰度：…
- [ ] 是否需要 embedding-service 联动：…

## Verify
- [ ] 单测：…
- [ ] 集成测试：…
- [ ] 手动验证：…

## Rollback
- 配置：…
- 代码：…
```

## 附录 B：Sprint 完成定义 (DoD)

| 项目 | 必须满足 |
|---|---|
| 代码 | 合入主干，通过所有 CI |
| 测试 | 单测覆盖率达标；集成测试通过 |
| 文档 | 本手册对应章节已 review |
| 监控 | 涉及指标已上 Grafana；告警规则已加 |
| 评测 | golden set 跑过；指标记录在 eval 仓库 |
| 灰度 | （仅 Sprint 3+4）灰度计划已写入 wiki |
| 回滚 | 回滚步骤已演练 |

---

## 附录 C：与上一版方案的差异

> 本手册相对于 [hybrid-retrieval.md](hybrid-retrieval.md) 新增/修正：

| 项 | 上一版 | 本手册 |
|---|---|---|
| 三表 ACL 字段 | 未涉及（隐含越权风险） | §2.2 P0 必修 |
| 双写一致性 | "同事务" 表述错误（Milvus 无事务） | §2.1 顺序约定 + §3.3 reconcile |
| 通道异常分级 | "completeOnTimeout 兜底" | §3.2 DENSE fail-close + 其它 fail-open |
| Fusion key | docId\|chunkSeq | §2.4 docId\|version\|chunkSeq |
| 部分失败时融合归一 | 未涉及 | §4.3 按 successfulChannels 归一 |
| z-norm 边界 | 未涉及 | §4.3 样本不足降级 min-max |
| RRF k | 单值 60 | §4.3 按通道分组 |
| STRUCTURED boost | 固定 0.5 | §4.3 按 matchedDocCount 衰减 |
| LLM Planner | 直接调用 | §5.1 Circuit Breaker |
| sub-query 并发 | 默认 3 | §5.2 默认 1，等 embedding batch 后开 3 |
| 线程池 | "channels.size()" | §4.2 ThreadPoolTaskExecutor + CallerRuns |
| 连接池 | 默认 10 | §5.5 提到 30 + 监控 |
| Rerank fallback | 强制改 minScore | §5.3 不改分数 + 阈值 +0.2 |
| 灰度切流 | "all-off 即回滚" | §5.4 rollout-percent + hash 分桶 |
| 可观测指标 | "Micrometer" 一笔带过 | §5.5 完整指标清单 + Grafana + 告警 |
| 故障预案 | 无 | §13 4 类 Runbook |
| 回滚预案 | 无分级 | §12 L0-L5 分级 |
| ArchUnit | 一句话 | §4.2 具体规则 |

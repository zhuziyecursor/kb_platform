# KB Platform 第二阶段（Phase 2）能力补全规划

> 版本：V1.0  
> 日期：2026-05-10  
> 依据：项目现状盘点、用户期望功能点、三阶段技术路线

---

## 一、Phase 2 总体定位

**目标：从"能回答"升级为"答得准、体验好、有基础安全保障"**

- **时间：4-6 周**
- **核心命题：** 检索质量提升 + 问答体验增强 + 基础安全策略 + 反馈数据埋点
- **明确不做（放到 Phase 3）：** 完整 OIDC/OBO 权限打通、评测体系闭环、生产级监控治理

Phase 2 的验收标准：**精确条款 Recall@5 提升 30% 以上；FAQ 平均延迟低于 500ms；RAG 首 Token P95 < 1.5s；Top3 引用人工准确率 > 85%；拒答准确率 > 90%。**

---

## 二、六大功能域 × Phase 2 细化目标

### 功能域 1：知识库生命周期管理

| # | 功能点 | Phase 2 目标 | 现状缺口 | 实现思路 | 验收标准 |
|---|--------|-------------|---------|---------|---------|
| 1.1 | **OCR/扫描件解析** | 图片 PDF、扫描件、照片中的文字可提取入库 | `OCRParser` 为占位代码，直接抛异常 | 接入 `PaddleOCR` 或 `Tesseract+EasyOCR`，在 `kb-doc-processor` 中实现 `OCRParser.parse()`；配置开关控制；质量低于 Tika 文本时标记 `parse_quality` | 图片 PDF 上传后 5 分钟内完成解析入库；OCR 文本与人工校对准确率 > 90% |
| 1.2 | **PII 敏感信息脱敏** | 入库前自动检测并脱敏身份证号、手机号、银行卡号、姓名等 | `PIIFilter` 为占位代码 | 基于正则 + 规则引擎实现 `PIIFilter.clean()`；支持配置脱敏策略（`MASK`/`REMOVE`/`HASH`）；脱敏标记写入 `knowledge_clean` 的 `meta_json` | 标准测试集（100 条含 PII 文本）检测率 > 95%，误杀率 < 5% |
| 1.3 | **增量更新与版本覆盖** | 支持文档内容更新后只变更差异 chunk，不重跑全量 | 当前任何修改触发完整重新解析；`overwriteExisting` 抛 PHASE2 异常 | 基于 `text_hash` 对比：新 chunk 与旧 chunk 的 hash 一致则跳过，差异部分生成新的 `embed_task`；旧版本 Milvus 向量标记 `OFFBOARDED` 或删除 | 30 页文档小修改后入库时间 < 1 分钟；版本历史可回溯 |
| 1.4 | **元数据自动抽取** | chunk 级关键词、摘要自动生成 | `keywords`/`summary` Milvus 字段为空 | 接入轻量模型（如 `KeyBERT` 或 LLM 摘要接口）在 `kb-doc-processor` 切片后提取；`keywords` 空格分隔写入 Milvus | 关键词与人工标注一致性 > 70%；摘要覆盖核心语义 |
| 1.5 | **文档软下线** | 支持文档/版本下线，下线后不再被检索 | 删除仅删 DB 和 MinIO，Milvus 向量未同步删除 | `ingest-service` 增加 `offboard` 接口；vector-service 消费 `delta-notify` 或同步调用 Milvus `delete`；`knowledge_version` 状态变为 `OFFBOARDED` | 下线后 30 秒内检索不再命中；Trace 中可查询下线记录 |

**优先级：1.3 > 1.5 > 1.1 > 1.2 > 1.4**

---

### 功能域 2：多轮对话与上下文管理

| # | 功能点 | Phase 2 目标 | 现状缺口 | 实现思路 | 验收标准 |
|---|--------|-------------|---------|---------|---------|
| 2.1 | **话题切换检测** | 用户突然切换话题时，系统自动丢弃无关历史上下文 | 当前所有历史消息无条件拼入 Prompt，无话题边界判断 | 基于 LLM 或规则实现 `TopicShiftDetector`：对比当前 query 与上一轮 query 的语义相似度（embedding 余弦距离），低于阈值则认为话题切换，清空历史上下文 | 话题切换识别准确率 > 85%；切换后回答不再受旧上下文干扰 |
| 2.2 | **追问增强（多跳意图）** | 支持"第二条具体怎么说""前面提到的第三条"等复杂追问 | 当前仅支持简单代词替换（那/这个/上述） | 在 `QueryRewritingService` 中增加 **引用消解模块**：解析上一轮 citations 的 docId/sectionPath/chunkSeq，将追问中的"第二条"映射到具体 chunk 内容，改写为完整 query | 追问改写后检索命中率 > 80%；人工评估追问理解准确率 > 85% |
| 2.3 | **纠错模式** | 用户指出"你刚才回答错了"时，系统能识别并重新检索生成 | 无纠错处理流程 | 增加纠错意图识别（规则："错了""不对""重新说"）；触发时丢弃上一轮答案，扩大检索范围（如 topK 从 50 扩到 100），或切换到不同知识空间重试 | 纠错触发后重新生成答案，用户满意度 > 70% |
| 2.4 | **会话状态可视化** | 前端展示当前会话的话题边界、上下文窗口占用率 | 无 | 前端在 RAG 页面增加"上下文"折叠面板，展示当前保留的历史轮数、token 占用、话题切换标记 | UI 可用，信息准确 |

**优先级：2.1 > 2.2 > 2.3 > 2.4**

---

### 功能域 3：答案溯源与引用

| # | 功能点 | Phase 2 目标 | 现状缺口 | 实现思路 | 验收标准 |
|---|--------|-------------|---------|---------|---------|
| 3.1 | **引用跳转原文** | 用户点击引用标记可直接跳转到原文档对应段落 | 后端返回了 page/sectionPath，但没有生成原文跳转链路 | `ingest-service` 新增 `GET /kb/v1/docs/{docId}/preview?page={page}&highlight={text}` 接口，返回 MinIO presigned URL + 页码参数（PDF 可通过 URL hash 定位页码）；前端引用卡片增加"查看原文"按钮 | 点击后 3 秒内打开原文档；页码定位误差 < 1 页 |
| 3.2 | **原文高亮** | 预览文档时自动高亮被引用的段落 | 无 | Portal 前端接入 PDF.js 或文档预览组件，根据传入的 `highlight` 参数对匹配文本进行黄色高亮渲染 | 高亮位置准确，UI 可用 |
| 3.3 | **引用可信度标记** | 不同引用按相关度显示不同颜色/图标（高可信/中可信/低可信） | 当前所有引用样式一致 | 基于 rerank score 分级：`score >= 0.8` 绿色高可信，`0.5-0.8` 黄色中可信，`< 0.5` 橙色低可信；前端展示不同图标 | 分级规则可配置，UI 清晰可辨识 |

**优先级：3.1 > 3.2 > 3.3**

---

### 功能域 4：权限控制和多租户隔离

| # | 功能点 | Phase 2 目标 | 现状缺口 | 实现思路 | 验收标准 |
|---|--------|-------------|---------|---------|---------|
| 4.1 | **CurrentUserContext 抽象** | 业务代码不再直接依赖 `DEV_TENANT_ID`/`DEV_USER_ID` 等硬编码常量 | Controller/Service 中大量硬编码 | 新增 `CurrentUserContext` 接口 + `DevCurrentUserContext` 实现（Phase 2 先用 dev 实现）；所有业务代码通过 `context.getTenantId()`/`getUserId()`/`getPermGroupIds()` 获取；Phase 3 再替换为 JWT 实现 | 代码扫描无直接引用 DEV 常量；单元测试通过 |
| 4.2 | **空间级运维开关** | 管理员可强制指定某类问题走特定知识库/空间 | 无 | `rag-service` 增加路由规则配置表 `rag_route_rule`：`query_pattern`（正则/关键词）→ `target_space_id`；命中规则时强制限定检索范围 | 规则命中后检索范围正确；规则可热更新（无需重启） |
| 4.3 | **Milvus ACL 表达式下推** | 将 `sec_level`/`perm_group_id`/`effective_to` 等过滤条件真正下推到 Milvus | 当前因 Milvus 2.4.17 AND 表达式 bug 仅在客户端过滤 | 升级 Milvus 到 2.5+（修复复合表达式），或拆分多次查询 + 客户端合并；将 `buildAclFilter()` 中的完整过滤表达式传入 Milvus `withExpr` | ACL 过滤完全在 Milvus 层完成；P95 检索延迟不劣化；零越权召回 |
| 4.4 | **多租户数据隔离审计** | 定期巡检是否存在跨租户数据泄露 | 无 | 增加定时任务（或 SQL 巡检脚本）：检查 `knowledge_doc`/`kb_documents` 中是否存在 `tenant_id` 与所属 doc/space 不一致的记录 | 每周巡检报告；发现问题可自动告警 |

**优先级：4.1 > 4.3 > 4.2 > 4.4**

**说明：** 完整的 OIDC/OBO/JWT 权限打通放到 Phase 3，Phase 2 先把代码层面的硬编码解耦，并补齐 Milvus ACL 下推这个性能瓶颈。

---

### 功能域 5：反馈闭环与持续优化

| # | 功能点 | Phase 2 目标 | 现状缺口 | 实现思路 | 验收标准 |
|---|--------|-------------|---------|---------|---------|
| 5.1 | **用户反馈埋点（点赞/点踩/报错）** | 用户可对每条答案点赞、点踩、标记"回答错误"/"引用不准"/"不相关" | 无任何反馈接口或表 | 新增表 `feedback_record`：`message_id`、`feedback_type`（LIKE/DISLIKE/REPORT）、`report_reason`（HALLUCINATION/WRONG_CITATION/IRRELEVANT/OTHER）、`comment`；RAG 接口返回中增加 `feedbackUrl`；前端在每条 assistant 消息下方增加 👍/👎/🚩 按钮 | 前端交互可用；反馈数据持久化到 PG |
| 5.2 | **Badcase 自动归档** | 点踩和报错的记录自动归入 badcase 库，关联完整 Trace | 无 | `rag-service` 消费反馈消息（或定时任务扫描），将 `feedback_type=DISLIKE/REPORT` 的记录关联 `rag_pipeline_trace`，写入 `badcase_archive` 表；包含 query/rewrittenQuery/citations/traceId/answer | 每条 badcase 可回放完整检索链路；badcase 库可按时间/原因/空间筛选 |
| 5.3 | **高频问题自动发现** | 自动识别高频 query，作为 FAQ 候选或检索优化依据 | 无 | 基于 `rag_pipeline_trace` 按 `query_text` 聚合，统计高频 query（去重后 Top 100）；对高频 query 生成检索质量报告（平均 recall、rerank score、是否拒答） | 每周自动生成高频问题报告；Top 20 高频问题人工复核 |
| 5.4 | **答案自评置信度** | LLM 生成答案后，要求模型输出置信度评分，作为拒答辅助判断 | 当前仅靠检索侧分数阈值，无模型自评 | Prompt 增加要求：生成答案后，模型需输出 `[CONFIDENCE: HIGH/MEDIUM/LOW]`；`rag-service` 解析该标记，LOW 置信度时追加人工复核提示 | 模型自评与人工判断一致性 > 75% |

**优先级：5.1 > 5.2 > 5.3 > 5.4**

**说明：** Phase 2 先完成"数据埋点和 badcase 收集"，为 Phase 3 的评测体系（eval-service + eval_dataset）积累数据。没有反馈数据，评测体系就是无米之炊。

---

### 功能域 6：干预与安全策略

| # | 功能点 | Phase 2 目标 | 现状缺口 | 实现思路 | 验收标准 |
|---|--------|-------------|---------|---------|---------|
| 6.1 | **Query 黑白名单** | 拦截敏感/违规查询，白名单优先匹配 | 无任何输入过滤 | 新增 `query_blocklist` 表：`pattern`（正则/关键词）、`type`（BLOCK/ALLOW）、`action`（REJECT/REWRITE/ALERT）；`rag-service` 在 Query Rewrite 前匹配；BLOCK 直接返回统一拒绝话术 | 黑名单命中后 100% 拦截；误拦截率 < 1% |
| 6.2 | **输出敏感词过滤** | LLM 生成答案后，过滤敏感/不合规内容 | 无输出过滤 | 新增 `OutputFilterService`：基于敏感词库 + 正则，对 answer 做最终过滤；命中敏感词时替换为 `***` 或触发人工复核流程 | 标准敏感词测试集拦截率 100%；不影响正常业务回答 |
| 6.3 | **Prompt 注入防护** | 防止用户通过输入绕过系统指令 | 无防护 | 输入层增加 `PromptInjectionDetector`：检测常见注入模式（`忽略以上指令`/`你的系统提示是什么`/`DAN 模式` 等）；检测到后重置为安全 query 或直接拒答 | 常见注入模式 100% 拦截；正常业务 query 不误杀 |
| 6.4 | **RAG 运维熔断开关** | 管理员可一键关闭 RAG、强制走 FAQ、或降级为纯检索 | 无 | `rag-service` 增加运行时配置（Redis/config server）：`rag_mode`（FULL/FAQ_ONLY/RETRIEVE_ONLY/DISABLED）；各 mode 对应不同 Pipeline 分支 | 切换模式后 10 秒内生效；降级模式回答质量可接受 |

**优先级：6.1 > 6.2 > 6.3 > 6.4**

---

## 三、Phase 2 新增核心能力（三阶段路线中的检索增强）

以上六大功能域主要补的是"工程体验和安全"，Phase 2 还有一个核心命题是**检索质量提升**。以下是项目原有规划中 Phase 2 必须落地的检索增强能力：

| # | 能力 | 目标 | 实现思路 | 验收标准 |
|---|------|------|---------|---------|
| A.1 | **BM25 关键词检索** | 对条款编号、专有名词、精确数值敏感召回 | 方案选型：① PostgreSQL `tsvector` + `tsquery`（轻量）；② OpenSearch/Elasticsearch（独立索引）；③ Milvus 的 `SparseVector`（2.5+ 支持）。建议 Phase 2 先用 PG 全文检索做原型，验证效果后再决定是否引入 OpenSearch | "第 32 条"类 query Recall@5 提升 30% |
| A.2 | **FAQ 高置信短路** | 高频问题直接返回预置答案，不走完整 RAG | 新增 `faq_knowledge` 表（question/answer/space_id/hit_count）；检索前先用向量相似度匹配 FAQ，score > 0.95 直接返回答案 | FAQ 命中延迟 < 500ms；准确率 > 95% |
| A.3 | **条款编号 Fast Path** | 精确匹配条款编号，绕过向量模糊检索 | `KeywordFallbackService` 已提取条款编号；增强为：提取后直接查 PostgreSQL `knowledge_structured` 的 JSONB（`section_path` 匹配），命中则优先返回 | 条款编号 query 精确命中 > 90% |
| A.4 | **RRF 多路融合** | Dense + BM25 + FAQ 结果融合，取最优 TopK | 实现 `RRFFusionService`：`score_rrf = 1/(k + rank_dense) + 1/(k + rank_bm25) + weight_faq * score_faq`，k 取 60 | 融合后整体 Recall@5 优于任一路单独结果 |
| A.5 | **LLM-based Query Rewrite** | 复杂 query 的意图理解、子问题分解、同义词扩展 | 调用 LLM Gateway，输入 query + 会话历史，输出：`{"main_query": "...", "sub_queries": ["..."], "keywords": ["..."], "intent": "POLICY_QA/DOC_SEARCH/CHITCHAT"}` | 改写后检索命中率 > 80%；意图分类准确率 > 85% |
| A.6 | **意图路由** | 闲聊/工具查询不走 RAG，降低成本和幻觉 | 基于 A.5 的 intent 结果路由：`POLICY_QA`→完整 RAG，`DOC_SEARCH`→仅检索不生成，`CHITCHAT`→通用 LLM 直接回答，`TOOL`→调用工具 | 闲聊类 query RAG 调用率降低 80% |

**检索增强优先级：A.5 > A.1 > A.2 > A.6 > A.3 > A.4**

---

## 四、Phase 2 功能总览与排期

### 4.1 必做（Must Have）—— 第 1-4 周

| 周 | 功能域 | 具体功能 | 负责人建议 |
|----|--------|---------|-----------|
| W1 | 检索增强 | A.5 LLM Query Rewrite + A.6 意图路由原型 | 后端 |
| W1 | 权限抽象 | 4.1 CurrentUserContext 抽象 + 代码重构 | 后端 |
| W1 | 安全策略 | 6.1 Query 黑白名单 + 6.2 输出敏感词过滤 | 后端 |
| W2 | 检索增强 | A.1 BM25 原型（PG tsvector）+ A.2 FAQ 短路 | 后端 |
| W2 | 反馈闭环 | 5.1 点赞点踩 + 5.2 Badcase 归档表 + API | 后端+前端 |
| W2 | 生命周期 | 1.3 增量更新/版本覆盖 | 后端 |
| W3 | 检索增强 | A.3 条款 Fast Path + A.4 RRF 融合 + 联调 | 后端 |
| W3 | 多轮对话 | 2.1 话题切换检测 + 2.2 追问增强 | 后端 |
| W3 | 溯源引用 | 3.1 引用跳转原文接口 | 后端 |
| W4 | 生命周期 | 1.5 文档软下线 + Milvus 删除链路 | 后端 |
| W4 | 权限控制 | 4.3 Milvus ACL 下推 + 压测 | 后端 |
| W4 | 溯源引用 | 3.2 原文高亮 + 3.3 可信度标记（前端） | 前端 |

### 4.2 应做（Should Have）—— 第 5-6 周

| 周 | 功能域 | 具体功能 |
|----|--------|---------|
| W5 | 生命周期 | 1.1 OCR 解析（图片 PDF） |
| W5 | 安全策略 | 6.3 Prompt 注入防护 + 6.4 运维熔断开关 |
| W5 | 反馈闭环 | 5.3 高频问题自动发现 + 5.4 答案自评置信度 |
| W6 | 生命周期 | 1.2 PII 脱敏 + 1.4 元数据自动抽取 |
| W6 | 权限控制 | 4.2 空间级运维开关 + 4.4 租户隔离审计 |
| W6 | 多轮对话 | 2.3 纠错模式 + 2.4 会话状态可视化（前端） |

### 4.3 可延期（Could Have）—— Phase 2 末尾或 Phase 3

- 1.4 元数据自动抽取（可用 Phase 2 轻量方案，Phase 3 再升级 LLM 抽取）
- 3.3 引用可信度标记（UI 增强，不影响核心链路）
- 2.4 会话状态可视化（前端展示，数据层 Phase 2 已具备）

---

## 五、关键依赖与风险

| 风险项 | 影响 | 应对策略 |
|--------|------|---------|
| Milvus 升级（2.4→2.5+） | ACL 下推和 SparseVector 依赖新版本 | 先在测试环境验证升级兼容性；如升级风险大，Phase 2 先用 PG 全文检索替代 BM25 |
| LLM Query Rewrite 成本 | 每次问答多一次 LLM 调用，成本翻倍 | 缓存改写结果（Redis）；简单 query 跳过改写（规则判断）；意图分类可用轻量模型替代 LLM |
| OCR 准确率 | 扫描件质量差异大，可能产生大量噪声 | 质量评分机制：OCR 文本质量分 < 阈值时标记为 `LOW_QUALITY`，人工复核后再入库 |
| 增量更新复杂度 | chunk diff 逻辑涉及 hash 对比、版本回溯、Milvus 部分删除 | 先实现"版本覆盖=全量删除旧版+全量插入新版"的简化方案；真正的 chunk 级 diff 放到 Phase 3 |
| 反馈数据量不足 | Phase 2 刚开始收集反馈，无法做有意义的分析 | 先保证埋点完整；分析能力用规则+SQL 聚合即可，复杂 AI 分析放到 Phase 3 |

---

## 六、Phase 2 → Phase 3 的衔接

Phase 2 完成后，以下能力必须为 Phase 3 准备好数据/接口/架构基础：

| Phase 2 产出 | Phase 3 用途 |
|-------------|-------------|
| `feedback_record` / `badcase_archive` 表 | 评测体系的评测集（eval_dataset）来源 |
| `CurrentUserContext` 接口 | 替换为 JWT claims 实现，零业务代码改动 |
| `rag_route_rule` 表 | 扩展为完整的意图路由 + 工具调用配置 |
| BM25 原型（PG tsvector） | 决定是否升级 OpenSearch/ES |
| `query_blocklist` / `output_filter` | 扩展为完整的内容安全策略中心 |
| Pipeline Trace 数据积累 | 训练检索质量模型、A/B 测试实验平台 |

---

## 七、验收检查清单

Phase 2 结束时的验收标准：

- [ ] 精确条款类 query（如"第三十二条"）Recall@5 提升 >= 30%
- [ ] FAQ 短路平均延迟 < 500ms
- [ ] RAG 首 Token P95 < 1.5s
- [ ] Top3 引用人工准确率 > 85%
- [ ] 拒答准确率 > 90%
- [ ] 代码中无直接引用 `DEV_TENANT_ID`/`DEV_USER_ID` 常量（通过 `CurrentUserContext`）
- [ ] 黑名单/敏感词拦截率 100%（标准测试集）
- [ ] 每条 badcase 可回放完整检索链路（Trace + citations + query）
- [ ] 文档软下线后 30 秒内检索零命中
- [ ] 话题切换检测准确率 > 85%

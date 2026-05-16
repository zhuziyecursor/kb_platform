# 评测数据集生成 & RAG 准确度验证系统 — 技术方案

## 概述

为 kb-platform 构建可视化的评测数据集生成与 RAG 准确度验证系统。用户通过前端页面触发数据集生成流程，实时观察 Pipeline 进度，并使用生成的数据集对 RAG 系统进行量化评测。

### 数据来源

3,568 个中文金融/会计/审计领域 HTML 文件（76MB，17 个分类），来源于 opencpai.com 知识库。

---

## 架构决策

**扩展 rag-service，不新建服务。** 理由：
- rag-service 已有 SSE 流式推送（SseEmitter + ExecutorService）
- 已有 PipelineTraceService 可观测性框架
- 已有 LlmGatewayClient 可用于调用 LLM 生成 QA
- 评测表属于 kb_audit schema（rag-service 管理的 schema）
- 避免新增服务的复杂性（DB 用户、网关路由、CORS 配置等）

---

## 数据库设计

所有评测表位于 `kb_audit` schema。

### eval_dataset — 数据集主表

| 字段 | 类型 | 说明 |
|------|------|------|
| dataset_id | VARCHAR(64) UNIQUE | 数据集唯一标识 |
| tenant_id | VARCHAR(64) | 租户 ID |
| name | VARCHAR(256) | 数据集名称 |
| source_type | VARCHAR(32) | HTML_FILES / MANUAL_UPLOAD / CHUNK_IMPORT |
| source_path | TEXT | 文件路径或来源描述 |
| file_count | INT | 文件数量 |
| total_chunks | INT | 分块总数 |
| total_qa_pairs | INT | QA 对总数 |
| qa_config | JSONB | 生成配置（类型分布、模型、温度等） |
| status | VARCHAR(32) | DRAFT / GENERATING / COMPLETED / FAILED |
| progress | JSONB | 当前进度（阶段、已完成数、预计剩余时间） |

### eval_qa_pair — QA 对表

| 字段 | 类型 | 说明 |
|------|------|------|
| pair_id | VARCHAR(64) UNIQUE | QA 对唯一标识 |
| dataset_id | VARCHAR(64) FK | 所属数据集 |
| question | TEXT | 问题 |
| answer | TEXT | 标准答案 |
| qa_type | VARCHAR(32) | FACTUAL / COMPARISON / MULTI_HOP / UNANSWERABLE |
| source_chunk_ids | TEXT[] | 来源分块 ID 列表 |
| source_doc_path | TEXT | 来源 HTML 文件路径 |
| difficulty | VARCHAR(16) | EASY / MEDIUM / HARD |
| metadata | JSONB | 生成元信息 |

### eval_run — 评测运行表

| 字段 | 类型 | 说明 |
|------|------|------|
| run_id | VARCHAR(64) UNIQUE | 运行唯一标识 |
| dataset_id | VARCHAR(64) FK | 被评测的数据集 |
| config | JSONB | 评测配置（spaceId, topK, rerankEnabled 等） |
| metrics | JSONB | 聚合指标（exactMatch, f1, recall, llmJudgeScore） |
| progress | JSONB | 运行进度 |

### eval_qa_result — 单条评测结果

| 字段 | 类型 | 说明 |
|------|------|------|
| run_id | VARCHAR(64) FK | 所属运行 |
| pair_id | VARCHAR(64) FK | 对应 QA 对 |
| rag_answer | TEXT | RAG 系统返回的答案 |
| rag_trace_id | VARCHAR(128) | RAG Pipeline Trace ID |
| exact_match | BOOLEAN | 精确匹配 |
| f1_score | DOUBLE | F1 分数 |
| recall | DOUBLE | 召回率 |
| llm_judge_score | DOUBLE | LLM Judge 评分 1-5 |

---

## 后端 API 设计

所有端点位于 `/rag/v1/eval/*`

### 数据集 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/rag/v1/eval/datasets` | 创建数据集 |
| GET | `/rag/v1/eval/datasets` | 列表（分页） |
| GET | `/rag/v1/eval/datasets/{id}` | 详情 |
| DELETE | `/rag/v1/eval/datasets/{id}` | 删除 |

### 生成 Pipeline（SSE）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/rag/v1/eval/datasets/{id}/generate` | **SSE 流式生成** |
| GET | `/rag/v1/eval/datasets/{id}/progress` | 轮询进度 |

### QA 对查询

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/rag/v1/eval/datasets/{id}/pairs` | 分页查询（按类型/难度筛选） |

### 评测运行

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/rag/v1/eval/runs` | 创建评测运行 |
| POST | `/rag/v1/eval/runs/{id}/execute` | **SSE 流式执行评测** |
| GET | `/rag/v1/eval/runs/{id}` | 评测详情 |
| GET | `/rag/v1/eval/runs/{id}/results` | 单条结果列表 |

---

## 生成 Pipeline 5 阶段

```
Stage 1: PARSE_HTML    → Jsoup 解析 HTML，提取纯文本
Stage 2: CHUNK_TEXT    → 滑动窗口分块，保留文档层级结构
Stage 3: GENERATE_QA   → 批量 LLM 调用生成 4 类 QA（瓶颈阶段）
Stage 4: VALIDATE_QA   → 去重 + 长度检查 + 不可回答验证
Stage 5: STORE_RESULTS → 批量写入 PostgreSQL
```

每个阶段完成后通过 SSE `event: stage` 推送进度（复用 StageEvent DTO），最终 `event: done`。

### QA 类型分布

| 类型 | 占比 | 说明 |
|------|------|------|
| FACTUAL | ~30% | 原文直接匹配 |
| COMPARISON | ~20% | 对比多个实体/数值/时间 |
| MULTI_HOP | ~20% | 跨分块综合推理 |
| UNANSWERABLE | ~10% | 文档无法回答（测幻觉） |
| 自适应 | ~20% | LLM 根据内容自行判断最佳类型 |

### LLM 集成

复用已有 `LlmGatewayClient`，System Prompt 引导 LLM 输出结构化 JSON：

```json
[{"question": "...", "answer": "...", "qaType": "FACTUAL", "sourceChunkIds": [0, 2], "difficulty": "EASY"}]
```

---

## 前端架构

### 路由结构

```
/evaluation                        — 评测中心主页（数据集列表 + 评测历史）
/evaluation/create                 — 创建数据集（名称、来源、QA 配置）
/evaluation/[datasetId]            — 数据集详情（QA 列表 + 评测历史）
/evaluation/[datasetId]/generate   — 生成进度页（SSE 实时 Pipeline 可视化）
```

### 导航

在 `AppLayout.tsx` 的 `NAV_ITEMS` 新增：
```typescript
{ key: 'evaluation', icon: <ExperimentOutlined />, label: '评测中心', path: '/evaluation' }
```

### SSE 消费

前端 `generateDataset()` 复用 `ragChatStream()` 的 SSE 事件解析模式：
- `event: stage` → 更新 Pipeline 阶段 UI
- `event: done` → 显示摘要 + 跳转
- `event: error` → 显示错误

### 技术栈

- antd v5 组件（Table, Card, Tag, Progress, Steps, Tabs）
- 无额外状态管理库（useState + useEffect）
- 轮询 3s 间隔（数据集列表状态刷新）

---

## 文件清单

### 数据库
- `kb-infra/init-db/updates/028_eval_dataset.sql`

### 后端（rag-service）
- `entity/EvalDataset.java`
- `entity/EvalQaPair.java`
- `entity/EvalRun.java`
- `entity/EvalQaResult.java`
- `repository/EvalDatasetRepository.java`
- `repository/EvalQaPairRepository.java`
- `repository/EvalRunRepository.java`
- `repository/EvalQaResultRepository.java`
- `dto/CreateDatasetRequest.java`
- `dto/DatasetResponse.java`
- `dto/QaPairResponse.java`
- `dto/CreateEvalRunRequest.java`
- `dto/EvalRunResponse.java`
- `service/EvalDatasetService.java`
- `service/EvalGenerationPipeline.java`
- `service/EvalRunnerService.java`
- `controller/EvalController.java`
- `config/EvalProperties.java`
- `src/main/resources/application.yml` (追加配置)

### 前端（kb-portal/web）
- `src/app/evaluation/page.tsx`
- `src/app/evaluation/create/page.tsx`
- `src/app/evaluation/[datasetId]/page.tsx`
- `src/app/evaluation/[datasetId]/generate/page.tsx`
- `src/components/eval/DatasetCard.tsx`
- `src/components/eval/GenerationProgress.tsx`
- `src/components/eval/QaPairTable.tsx`
- `src/components/eval/EvalRunProgress.tsx`
- `src/components/eval/EvalMetricsDashboard.tsx`
- `src/components/eval/HtmlFileSelector.tsx`
- `src/components/eval/CreateEvalRunModal.tsx`
- `src/components/AppLayout.tsx` (修改)
- `src/api/http-client.ts` (修改)
- `src/types/index.ts` (修改)

---

## 关键设计决策

1. **HTML 解析选 Jsoup**：轻量、无外部依赖、中文编码良好
2. **SSE 超时 60 分钟**：足够完成 5,000 QA 对生成
3. **QA 批量生成**：每次 LLM 调用处理 20 chunk，约需 250 次调用
4. **文件输入双模式**：本地路径（开发/批量）+ 文件上传（临时/小规模）
5. **RAGAS 兼容输出**：支持导出标准 JSONL 格式

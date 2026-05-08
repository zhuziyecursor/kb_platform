# KB Platform 优化方案

> 本文档记录知识库平台在 MVP 完成后的阶段性优化方向，按优先级排序。

---

## P0 — 知识空间层级化

**详见：** [knowledge-space-hierarchy-design.md](./knowledge-space-hierarchy-design.md)

当前知识空间为单层平铺结构，改造为自引用树形结构，支持多层级分类，并在页面以 Tree 形式展示。这是其他优化的前提基础。

---

## P1 — 文档处理状态可见性

### 问题

用户上传文档后，文档要经过完整的入库 pipeline：

```
上传 → Kafka(file-ingest) → doc-processor(解析/清洗/切片) → Kafka(embed-task) → vector-service(向量化) → Milvus
```

全程耗时可能达数分钟，但前端文档列表没有任何进度反馈，用户不知道文档是否处理完成、是否可以被检索，体验较差。

### 方案

`knowledge_doc` 表已有 `status` 字段，各服务节点在处理时更新该状态。前端文档列表增加状态列，展示当前阶段。

**状态流转：**

```
PENDING（待处理）→ PARSING（解析中）→ CHUNKING（切片中）→ EMBEDDING（向量化中）→ READY（可检索）
                                                                              ↘ FAILED（处理失败）
```

**前端展示：**

| 状态 | 样式 | 说明 |
|------|------|------|
| PENDING | 灰色 Badge | 等待 doc-processor 消费 |
| PARSING / CHUNKING / EMBEDDING | 蓝色 Badge + 旋转图标 | 处理中 |
| READY | 绿色 Badge | 可被 RAG 检索 |
| FAILED | 红色 Badge + 错误信息 hover | 处理失败，支持重试 |

**技术实现：**
- 前端文档列表页对 `status IN (PENDING, PARSING, CHUNKING, EMBEDDING)` 的文档每 5 秒轮询一次
- 当文档全部进入终态（READY / FAILED）后停止轮询
- 失败文档支持"重新处理"按钮，重新发布到 `file-ingest` Kafka topic

**改动范围：** 前端文档列表组件（主要）+ doc-processor 各阶段补充状态更新调用（次要）

---

## P2 — RAG 检索体验优化

### 问题

当前 RAG 页面存在三个体验问题：

1. **无会话历史** — 刷新页面后对话记录丢失，无法回溯
2. **引用来源不清晰** — 用户不知道答案来自哪个文档哪个段落，可信度低
3. **无检索范围限定** — 每次检索全库，无法指定在某个知识空间或子树内检索

### 方案

#### 2.1 会话历史持久化

在 PostgreSQL 新增 `rag_session` 和 `rag_message` 两张表，由 rag-service 负责写入。前端左侧增加会话列表面板，支持切换历史会话。

#### 2.2 引用来源展示

rag-service 返回的答案中已包含 `references` 字段（文档 ID + 段落偏移量）。前端在答案卡片下方展示引用来源列表：

```
答案内容...

引用来源：
├── [审计案例库 / 案例评优] 违规调度.pdf  第 3 段
└── [法律法规库 / 国家级] 行业标准2024.pdf  第 7 段
```

点击引用可跳转到文档详情页，高亮对应段落。

#### 2.3 检索范围选择

RAG 对话框顶部增加"检索范围"下拉选择器，支持选择：
- 全部知识库（默认）
- 指定知识空间（含其子树）

前端将选中的 `spaceId` 传给 rag-service，rag-service 在 Milvus 查询时追加 `knowledge_space_id IN (subTreeIds)` 过滤条件。

**改动范围：** 前端 RAG 页面（主要）+ rag-service 接口扩展（次要）

---

## P3 — 从 Markdown 大纲批量导入空间结构

### 问题

企业知识库分类体系复杂，手动在界面逐个创建知识空间层级耗时且易出错。

### 方案

支持上传 Markdown 大纲文件，自动解析为树形知识空间结构并批量创建。

**解析规则：**

```markdown
# 根节点名称          ← 可选，作为顶层分组标题
## 一级分类           ← depth=0 根节点
### 二级分类          ← depth=1 子节点
#### 三级分类         ← depth=2 子节点
普通文本行            ← 忽略（视为备注，不创建节点）
```

**交互流程：**
1. 知识空间列表页增加"从大纲导入"按钮
2. 上传 .md 文件后，前端解析并展示预览树
3. 用户确认后，前端按层级顺序批量调用 `POST /kb/v1/spaces` 接口
4. 创建完成后刷新树形视图

**改动范围：** 纯前端实现，无需后端改动（复用现有创建接口）

---

## P4 — 空间数据统计看板

### 问题

当前知识库缺乏整体数据视图，管理员无法快速了解库的健康状态。

### 方案

在首页或知识空间列表顶部增加统计看板：

| 指标 | 数据来源 |
|------|---------|
| 各空间文档数分布（饼图） | `knowledge_doc` 按 `knowledge_space_id` GROUP BY |
| 最近 7 天新增文档趋势（折线图） | `knowledge_doc` 按 `create_time` 聚合 |
| 待处理 / 处理失败文档数（告警卡片） | `knowledge_doc` WHERE status IN ('PENDING','FAILED') |
| 向量库总条目数 | Milvus collection stats API |

**改动范围：** 前端新增统计组件 + ingest-service 新增统计聚合接口（2-3 个 SQL）

---

## 暂不规划

| 功能 | 原因 |
|------|------|
| 文件跨空间拖拽移动 | 依赖 Milvus 原子更新，数据一致性风险高，单独立项评估 |
| 全文检索（BM25） | Phase 2 占位，基础设施未就绪 |
| 文档 OCR 解析 | Phase 2 占位 |
| 多租户隔离强化 | 当前硬编码 tenant_id，Phase 2 从 JWT 解析 |

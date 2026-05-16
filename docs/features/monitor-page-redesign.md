# 监控日志页面重构计划

## Context

当前 `/monitor` 页面只有一个 traceId 查询功能，使用与 `/rag` 页面相同的 `PipelineTraceView` 组件展示结果 —— 与知识问答页面的"链路详情"抽屉完全重复。唯一独特价值是 Grafana 入口。用户希望监控日志页面展示真正的日志数据：请求日志、审计日志、操作日志等。

## 改造方案

将监控页面从"单个 trace 查询"改为**分类日志列表视图**，提供分页表格、筛选和详情下钻。

### 页面布局

```
┌─ Grafana 快捷入口卡片（保留，缩小）─────────────┐
├─ Tabs: 请求日志 | 反馈审计 | 操作日志 ──────────┤
├─ 筛选栏（状态/时间范围/搜索）──────────────────│
├─ 数据表格（分页）──────────────────────────────│
└─ 点击行 → Drawer 展示详情 ────────────────────┘
```

### Tab 1: 请求日志
- 数据源：`GET /rag/v1/traces`（新增后端分页接口）
- 表格列：时间 | Trace ID | 用户 | 查询内容 | 状态 | 耗时 | 引用数
- 筛选：状态(SUCCESS/REFUSED/ERROR)、时间范围
- 点击行 → Drawer 展示 `PipelineTraceView` 详情

### Tab 2: 反馈审计
- 数据源：`GET /rag/v1/badcases`（已有后端接口）+ 新增 `GET /rag/v1/feedback/list`
- 表格列：时间 | Trace ID | 查询 | 反馈类型 | 原因 | 状态 | 评论
- 筛选：反馈类型、状态、时间范围

### Tab 3: 操作日志
- PHASE2 占位，提示"文档操作日志将在后续版本上线"
- 提供跳转到文档管理页的链接

---

## 实现步骤

### Step 1: 后端 — 新增 Pipeline Trace 分页列表接口

**文件：** `kb-mcp/rag-service/src/main/java/com/kb/rag/dto/RagPipelineTraceSummary.java`（新建）

轻量级 DTO，仅包含列表视图所需字段（不含 stageTimings JSONB、hitDocs JSONB 等大字段）：
- traceId, tenantId, uid, sessionId, queryText, result, refusalReason, totalMs, recallCount, citationsCount, cacheHit, createdAt

**文件：** `kb-mcp/rag-service/src/main/java/com/kb/rag/repository/RagPipelineTraceRepository.java`（修改）

新增 JPQL 分页查询：
```java
@Query("SELECT new com.kb.rag.dto.RagPipelineTraceSummary(...) 
        FROM RagPipelineTrace t 
        WHERE t.tenantId = :tenantId 
          AND (:result IS NULL OR t.result = :result)
          AND (:from IS NULL OR t.createdAt >= :from)
          AND (:to IS NULL OR t.createdAt <= :to)
        ORDER BY t.createdAt DESC")
Page<RagPipelineTraceSummary> findTraceSummaries(...)
```

**文件：** `kb-mcp/rag-service/src/main/java/com/kb/rag/controller/ChatController.java`（修改）

新增端点：
```java
@GetMapping("/traces")
public ResponseEntity<Map<String, Object>> listTraces(
    @RequestParam String tenantId,
    @RequestParam(required = false) String result,
    @RequestParam(required = false) String from,
    @RequestParam(required = false) String to,
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size)
```

### Step 2: 后端 — 新增 Feedback 分页列表接口

**文件：** `kb-mcp/rag-service/src/main/java/com/kb/rag/repository/RagFeedbackRepository.java`（修改）

新增分页查询方法。

**文件：** `kb-mcp/rag-service/src/main/java/com/kb/rag/controller/ChatController.java`（修改）

新增端点：
```java
@GetMapping("/feedback/list")
public ResponseEntity<Map<String, Object>> listFeedback(
    @RequestParam String tenantId,
    @RequestParam(required = false) String feedbackType,
    @RequestParam(required = false) String from,
    @RequestParam(required = false) String to,
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size)
```

### Step 3: 前端 — API Client 新增接口函数

**文件：** `kb-portal/web/src/api/http-client.ts`（修改）

新增：
- `RagPipelineTraceSummary` 类型
- `listPipelineTraces(params)` — `GET /rag/v1/traces`
- `listBadcases(params)` — `GET /rag/v1/badcases`
- `listFeedbackRecords(params)` — `GET /rag/v1/feedback/list`

### Step 4: 前端 — 重构监控日志页面

**文件：** `kb-portal/web/src/app/monitor/page.tsx`（重写）

- 保留 Grafana 快捷入口卡片（缩小尺寸）
- 新增 Tabs 切换三个日志视图
- 请求日志 Tab：搜索框 + 状态筛选 + 日期范围 + antd Table + 分页
- 反馈审计 Tab：反馈类型筛选 + 状态筛选 + antd Table + 分页
- 操作日志 Tab：PHASE2 占位提示
- 点击表格行 → Drawer 展示 PipelineTraceView 或反馈详情

### Step 5: 构建验证

- 后端：`cd kb-mcp/rag-service && mvn compile`
- 前端：`cd kb-portal/web && npm run build`

---

## 关键文件清单

| 文件 | 操作 |
|------|------|
| `kb-mcp/rag-service/.../dto/RagPipelineTraceSummary.java` | 新建 |
| `kb-mcp/rag-service/.../repository/RagPipelineTraceRepository.java` | 修改 |
| `kb-mcp/rag-service/.../repository/RagFeedbackRepository.java` | 修改 |
| `kb-mcp/rag-service/.../controller/ChatController.java` | 修改 |
| `kb-portal/web/src/api/http-client.ts` | 修改 |
| `kb-portal/web/src/app/monitor/page.tsx` | 重写 |

## 验证方式

1. `mvn compile` 确认后端编译通过
2. `npm run build` 确认前端编译通过
3. 启动服务后访问 `/monitor` 页面，验证三个 Tab 正常渲染
4. 请求日志 Tab：确认表格展示、分页、筛选、点击查看详情
5. 反馈审计 Tab：确认表格展示、筛选功能
6. 确认 Grafana 入口仍然可用

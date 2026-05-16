# 监控日志功能优化方案

**评审时间**: 2026-05-14  
**评审角色**: 产品经理 + 技术架构师  
**当前版本**: MVP Phase 1  
**目标**: 从"能用"提升到"好用"，从"被动查看"到"主动洞察"

---

## 一、产品层面问题诊断

### 1.1 用户价值不清晰

**现状问题**:
- 监控页面是"日志堆砌"，缺乏业务洞察
- 用户不知道"看什么"、"怎么看"、"看完能干什么"
- 没有从用户角色出发设计功能（运营、技术、管理者需求不同）

**影响**:
- 功能使用率低
- 问题发现滞后（被动等用户投诉）
- 数据价值未被挖掘

### 1.2 信息架构混乱

**现状问题**:
- 4个Tab（请求日志、反馈审计、问题归档、操作日志）平铺，缺乏层次
- "请求日志"和"反馈审计"关联性强但割裂展示
- "问题归档"是"反馈审计"的子集，不应平级
- Grafana 入口突兀，与页面其他内容脱节

**影响**:
- 用户认知负担重
- 跨Tab查询效率低
- 功能定位模糊

### 1.3 缺乏可操作性

**现状问题**:
- 只能"看"，不能"做"
- Badcase 有状态字段（OPEN/REVIEWED/RESOLVED）但无法在界面修改
- 没有批量操作（批量标记、批量导出）
- 没有告警/通知机制

**影响**:
- 监控变成"事后验尸"
- 问题闭环依赖人工记忆
- 无法形成改进循环

---

## 二、技术层面问题诊断

### 2.1 性能瓶颈

**问题1: 全表扫描风险**
```java
// RagPipelineTraceRepository.java:36
WHERE t.tenantId = :tenantId
  AND (:result IS NULL OR t.result = :result)
  AND t.createdAt >= :from
  AND t.createdAt <= :to
ORDER BY t.createdAt DESC
```
- 缺少复合索引 `(tenant_id, created_at, result)`
- 日期范围过大时（如查询30天）性能下降
- 没有分页预加载优化

**问题2: N+1 查询隐患**
- 前端点击"详情"时才调用 `getPipelineTrace(traceId)`
- 高频操作会产生大量单次查询
- `hitDocs` / `stageTimings` 的 JSONB 解析开销未评估

**问题3: 前端轮询低效**
```typescript
// monitor/page.tsx 无自动刷新，依赖手动点击
// 应该支持可配置的自动刷新（30s/1min/5min）
```

### 2.2 数据一致性问题

**问题1: Trace 与 Feedback 关联脆弱**
```java
// FeedbackService.java:45
Optional<RagPipelineTrace> traceOpt = traceRepository.findByTraceId(traceId);
String tenantId = traceOpt.map(RagPipelineTrace::getTenantId).orElse("default");
```
- Trace 不存在时降级为 "default"，可能导致数据归属错误
- 应该抛出异常或拒绝提交

**问题2: Badcase 归档时机不明确**
```java
// FeedbackService.java:80
if ("DISLIKE".equals(request.getFeedbackType()) || "REPORT".equals(request.getFeedbackType())) {
    archiveBadcase(saved, traceOpt.orElse(null), assistantMsg);
}
```
- LIKE 反馈不归档，但可能需要用于"优质案例"分析
- 归档逻辑硬编码，扩展性差

### 2.3 可观测性不足

**问题1: 缺少聚合指标**
- 没有"今日成功率"、"平均响应时间"、"拒答率趋势"等关键指标
- `AnalyticsService` 只有 `getTopQueries`，功能单薄

**问题2: 缺少异常检测**
- 没有"响应时间突增"、"拒答率异常"的自动告警
- 依赖人工盯屏

**问题3: 日志与 Trace 割裂**
- Grafana 链接是硬编码 `http://localhost:31009`
- 无法从 Trace ID 直接跳转到 Grafana 对应日志

---

## 三、优化方案（分优先级）

### P0 - 立即修复（影响数据准确性）

#### 3.1 修复 Feedback 提交时的数据一致性
```java
// FeedbackService.java
public FeedbackResponse submit(FeedbackRequest request) {
    RagPipelineTrace trace = traceRepository.findByTraceId(request.getTraceId())
        .orElseThrow(() -> new IllegalArgumentException("Trace not found: " + request.getTraceId()));
    // 后续逻辑...
}
```

#### 3.2 添加数据库索引
```sql
-- kb_audit.rag_pipeline_trace
CREATE INDEX idx_trace_tenant_time_result 
ON kb_audit.rag_pipeline_trace(tenant_id, created_at DESC, result);

-- kb_audit.rag_feedback
CREATE INDEX idx_feedback_tenant_time_type 
ON kb_audit.rag_feedback(tenant_id, created_at DESC, feedback_type);

-- kb_audit.badcase_archive
CREATE INDEX idx_badcase_tenant_status_time 
ON kb_audit.badcase_archive(tenant_id, status, created_at DESC);
```

#### 3.3 前端硬编码 tenantId 改为动态获取
```typescript
// monitor/page.tsx:54
const DEV_TENANT_ID = 'dev-tenant-001'; // ❌ 硬编码

// 改为从 OBO token 解析或用户上下文获取
const { tenantId } = useAuth(); // ✅
```

---

### P1 - 核心体验提升（1-2周）

#### 3.4 重构信息架构

**新布局**:
```
┌─────────────────────────────────────────┐
│ 📊 实时概览（Dashboard）                 │
│  - 今日请求量 / 成功率 / 平均响应时间    │
│  - 拒答率趋势图 / Top 5 慢查询           │
│  - 反馈统计（点赞率 / 问题数）           │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 🔍 请求追踪（Traces）                    │
│  - 列表 + 高级筛选                       │
│  - 点击行展开详情（无需 Drawer）         │
│  - 关联反馈标记（👍/👎/🚩）             │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 🐛 问题工作台（Badcase Workbench）       │
│  - 待处理 / 已复核 / 已解决 看板视图     │
│  - 批量操作 / 状态流转 / 备注            │
│  - 导出为训练数据                        │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 📈 分析报告（Analytics）                 │
│  - 高频问题 / 知识空间热度 / 用户行为    │
│  - 可下载 PDF 报告                       │
└─────────────────────────────────────────┘
```

#### 3.5 添加实时概览 Dashboard

**后端新增接口**:
```java
// ChatController.java
@GetMapping("/analytics/dashboard")
public ResponseEntity<DashboardMetrics> getDashboard(
    @RequestParam String tenantId,
    @RequestParam(defaultValue = "today") String period) {
    // period: today / 7days / 30days
    return ResponseEntity.ok(analyticsService.getDashboardMetrics(tenantId, period));
}
```

**返回数据结构**:
```json
{
  "period": "today",
  "totalRequests": 1234,
  "successRate": 0.92,
  "avgResponseMs": 850,
  "refusalRate": 0.08,
  "feedbackStats": {
    "likeCount": 45,
    "dislikeCount": 12,
    "reportCount": 3
  },
  "topSlowQueries": [
    { "query": "...", "avgMs": 3200, "count": 5 }
  ],
  "refusalTrend": [
    { "hour": "00:00", "rate": 0.05 },
    { "hour": "01:00", "rate": 0.07 }
  ]
}
```

#### 3.6 Badcase 状态管理

**后端新增接口**:
```java
@PatchMapping("/badcases/{id}/status")
public ResponseEntity<Void> updateBadcaseStatus(
    @PathVariable Long id,
    @RequestBody Map<String, String> body) {
    String status = body.get("status"); // REVIEWED / RESOLVED / DISMISSED
    String note = body.get("note");
    badcaseService.updateStatus(id, status, note);
    return ResponseEntity.noContent().build();
}

@PostMapping("/badcases/batch-export")
public ResponseEntity<byte[]> exportBadcases(
    @RequestBody List<Long> ids) {
    // 导出为 JSONL 格式，用于模型训练
}
```

**前端看板视图**:
```typescript
// 拖拽式看板（类似 Jira）
<DragDropContext onDragEnd={handleDragEnd}>
  <Column title="待处理" status="OPEN" items={openItems} />
  <Column title="已复核" status="REVIEWED" items={reviewedItems} />
  <Column title="已解决" status="RESOLVED" items={resolvedItems} />
</DragDropContext>
```

#### 3.7 Trace 详情内联展示

**优化前**: 点击"详情"按钮 → 打开 Drawer → 加载数据  
**优化后**: 点击表格行 → 行下方展开详情（Ant Design `expandable`）

```typescript
<Table
  expandable={{
    expandedRowRender: (record) => (
      <PipelineTraceView traceId={record.traceId} inline />
    ),
    onExpand: (expanded, record) => {
      if (expanded) fetchTraceDetail(record.traceId);
    }
  }}
/>
```

---

### P2 - 高级功能（2-4周）

#### 3.8 智能告警系统

**后端定时任务**:
```java
@Scheduled(fixedRate = 60000) // 每分钟
public void checkAnomalies() {
    // 1. 检测拒答率突增（过去5分钟 > 阈值）
    // 2. 检测响应时间异常（P95 > 阈值）
    // 3. 检测错误率突增
    // 4. 发送告警（Webhook / 邮件 / 企业微信）
}
```

**告警配置界面**:
```typescript
// 前端新增 /monitor/alerts 页面
<AlertRuleForm>
  <Select label="指标" options={['拒答率', '响应时间', '错误率']} />
  <Input label="阈值" type="number" />
  <Select label="通知方式" options={['邮件', '企业微信', 'Webhook']} />
</AlertRuleForm>
```

#### 3.9 Trace 与 Grafana 联动

**动态生成 Grafana 链接**:
```typescript
// 从 traceId 跳转到 Grafana Loki 查询
const grafanaUrl = `http://localhost:31009/explore?` +
  `orgId=1&` +
  `left={"datasource":"loki","queries":[{"expr":"{trace_id=\\"${traceId}\\"}"}]}`;

<Button icon={<LinkOutlined />} href={grafanaUrl} target="_blank">
  查看完整日志
</Button>
```

#### 3.10 高频问题自动聚类

**后端新增**:
```java
@GetMapping("/analytics/query-clusters")
public ResponseEntity<List<QueryCluster>> getQueryClusters(
    @RequestParam String tenantId,
    @RequestParam(defaultValue = "7") int days) {
    // 使用 embedding 相似度聚类相似问题
    // 返回：{ "cluster": "采购流程", "queries": [...], "count": 45 }
}
```

**前端展示**:
```
📊 高频问题聚类（过去7天）
┌─────────────────────────────────────┐
│ 采购流程相关 (45次)                  │
│  - 采购合同审批流程是什么？(12次)    │
│  - 采购申请需要哪些材料？(8次)       │
│  - ...                               │
│ [生成 FAQ] [优化知识库]              │
└─────────────────────────────────────┘
```

#### 3.11 用户行为分析

**新增维度**:
- 用户活跃度（按部门/角色统计）
- 知识空间热度（哪些空间被频繁检索）
- 时段分布（高峰时段识别）
- 会话深度（平均轮次、放弃率）

**可视化**:
```typescript
<HeatMap
  data={hourlyActivity}
  xAxis="小时"
  yAxis="星期"
  colorScale="请求量"
/>
```

---

### P3 - 未来演进（Phase 2+）

#### 3.12 AI 辅助分析

- **自动根因分析**: 拒答时自动分析是"知识缺失"还是"权限问题"
- **答案质量评分**: 基于 LLM 自评 + 用户反馈的综合评分
- **改进建议生成**: "该问题可通过补充XX文档解决"

#### 3.13 A/B 测试平台

- 支持不同 Prompt 策略的对比实验
- 自动统计各策略的成功率/满意度
- 灰度发布新检索算法

#### 3.14 知识库健康度评估

- 文档覆盖率（哪些领域问题无法回答）
- 文档时效性（过期文档占比）
- 引用均衡度（是否过度依赖少数文档）

---

## 四、实施路线图

### Week 1-2: P0 修复 + P1 基础
- [ ] 修复数据一致性问题
- [ ] 添加数据库索引
- [ ] 实现 Dashboard 概览
- [ ] 重构信息架构（前端布局）

### Week 3-4: P1 核心功能
- [ ] Badcase 状态管理
- [ ] Trace 详情内联展示
- [ ] 批量操作 + 导出功能
- [ ] 自动刷新 + 筛选优化

### Week 5-6: P2 高级功能（选做）
- [ ] 智能告警系统
- [ ] Grafana 联动
- [ ] 高频问题聚类
- [ ] 用户行为分析

### Week 7+: P3 未来演进（规划）
- [ ] AI 辅助分析
- [ ] A/B 测试平台
- [ ] 知识库健康度

---

## 五、成功指标

### 产品指标
- **使用率**: 监控页面 DAU 提升 3x
- **问题响应速度**: Badcase 平均处理时间从 3天 → 1天
- **数据驱动决策**: 每周基于监控数据优化知识库 ≥ 1次

### 技术指标
- **查询性能**: P95 响应时间 < 500ms（当前 ~1.2s）
- **数据准确性**: Trace/Feedback 关联错误率 = 0
- **可观测性**: 异常检测覆盖率 100%（拒答/慢查询/错误）

---

## 六、风险与依赖

### 风险
1. **数据量增长**: 30天数据可能达到百万级，需要归档策略
2. **实时性要求**: Dashboard 刷新频率与数据库压力的平衡
3. **权限控制**: 不同角色看到的监控数据应该隔离

### 依赖
1. **Grafana 集成**: 需要 Grafana API Token 配置
2. **告警通道**: 需要企业微信/邮件服务配置
3. **Embedding 服务**: 问题聚类依赖 embedding-service

---

## 七、附录：关键代码位置

### 后端
- **Trace 查询**: `RagPipelineTraceRepository.java:21-40`
- **Feedback 提交**: `FeedbackService.java:40-88`
- **Badcase 归档**: `FeedbackService.java:95-135`
- **Analytics**: `AnalyticsService.java`

### 前端
- **监控页面**: `kb-portal/web/src/app/monitor/page.tsx`
- **Trace 详情**: `kb-portal/web/src/components/PipelineTraceView.tsx`
- **API 调用**: `kb-portal/web/src/api/http-client.ts`

### 数据库
- **Trace 表**: `kb_audit.rag_pipeline_trace`
- **Feedback 表**: `kb_audit.rag_feedback`
- **Badcase 表**: `kb_audit.badcase_archive`

---

**评审结论**: 当前监控功能是"能用的 MVP"，但距离"好用的产品"还有较大差距。建议按 P0 → P1 → P2 优先级逐步实施，预计 4-6 周可完成核心体验提升。

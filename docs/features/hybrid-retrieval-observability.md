# Task 4.5 — 可观测指标实施方案

> 状态：📋 待实施 | 版本：v1.0 | 2026-05-14
>
> 关联文档：[hybrid-retrieval-impl.md](hybrid-retrieval-impl.md) §5.5

---

## Context

当前 rag-service 仅在 `PipelineTraceService`（6 个指标）和 `QueryPlannerFacade`（1 个指标）有 Micrometer 埋点，vector-service 完全没有指标。通道执行、融合、rerank 降级、ACL 过滤、灰度分流等关键路径全部不可观测。本文档定义 13 个指标的具体埋点位置、Grafana 仪表板布局和告警规则。

---

## 1. 指标总表

| 指标名 | 类型 | Tag(s) | 所在文件 |
|--------|------|--------|---------|
| `rag.channel.latency` | Timer | `channel`, `result` | ChannelExecutor |
| `rag.channel.hits` | DistributionSummary | `channel` | ChannelExecutor |
| `rag.channel.timeout` | Counter | `channel` | ChannelExecutor |
| `rag.channel.failed` | Counter | `channel`, `reason` | ChannelExecutor |
| `rag.fusion.successful_channels` | Counter | `count` | HybridFusionService |
| `rag.fusion.partial_failure` | Counter | — | HybridFusionService |
| `rag.rerank.fallback` | Counter | — | ChatServiceImpl |
| `rag.rollout.variant` | Counter | `variant` | ChatServiceImpl |
| `rag.acl.filter_dropped` | Counter | `channel` | ChatServiceImpl |
| `rag.planner.fallback` | Counter | `reason` | QueryPlannerFacade (已有) |
| `resilience4j.circuitbreaker.*` | Gauge/Counter | `name` | resilience4j 自动暴露 |
| `rag.pipeline.refusal` | Counter | `reason`, `stream` | PipelineTraceService (已有) |
| `rag.reconcile.missing_in_milvus` | Gauge | `tenant` | ReconcileJob |

> 命名约定：遵循现有代码风格，指标名使用 `.` 分隔（非 `_`）。`resilience4j.circuitbreaker.*` 为框架自动暴露，替代手动实现 `rag_planner_circuit_open_total`。

---

## 2. ChannelExecutor — 通道执行指标

**文件：** `kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/ChannelExecutor.java`

注入 `Optional<MeterRegistry>`，在 `execute()` 中改 `supplyAsync` 为记录开始时间 → 执行 → 计算耗时 → 记录指标。

关键改动：将 timeout 检测从 `completeOnTimeout` 的默认值判断改为显式标记，以便区分 `timeout` vs `error` vs `success`。

```java
// 在 supplyAsync 内部记录开始时间
long startNs = System.nanoTime();
// ... 执行 channel.retrieve() ...
long durationMs = (System.nanoTime() - startNs) / 1_000_000;

// 记录指标
meterRegistry.ifPresent(registry -> {
    Timer.builder("rag.channel.latency")
        .tag("channel", cid.name())
        .tag("result", cr.success ? "success" : "error")
        .publishPercentileHistogram()
        .register(registry)
        .record(Duration.ofMillis(durationMs));
    if (cr.success) {
        DistributionSummary.builder("rag.channel.hits")
            .tag("channel", cid.name())
            .register(registry)
            .record(cr.hits.size());
    } else {
        Counter.builder("rag.channel.failed")
            .tag("channel", cid.name())
            .tag("reason", cr.error != null ? cr.error : "unknown")
            .register(registry)
            .increment();
    }
});
```

timeout 检测：在 `completeOnTimeout` 返回的默认 `ChannelResult` 中用 `"timeout"` 作为 error 值，收集阶段检查 `"timeout".equals(cr.error)` → 递增 `rag.channel.timeout` counter。

---

## 3. HybridFusionService — 融合指标

**文件：** `kb-mcp/rag-service/src/main/java/com/kb/rag/service/retrieval/fusion/HybridFusionService.java`

注入 `Optional<MeterRegistry>`，在 `fuse()` 方法入口和部分失败判断处埋点。

```java
// fuse() 入口
meterRegistry.ifPresent(registry -> {
    Counter.builder("rag.fusion.successful_channels")
        .tag("count", String.valueOf(successfulChannels.size()))
        .register(registry)
        .increment();
});

// 部分失败检测
if (successfulChannels.size() < plan.enabledChannels().size()) {
    meterRegistry.ifPresent(registry -> {
        Counter.builder("rag.fusion.partial_failure")
            .register(registry)
            .increment();
    });
}
```

---

## 4. ChatServiceImpl — rerank / rollout / ACL 指标

**文件：** `kb-mcp/rag-service/src/main/java/com/kb/rag/service/ChatServiceImpl.java`

### 4.1 `rag.rerank.fallback`

在 legacy 路径 `buildPipelineContext` 和 hybrid 路径 `buildHybridPipelineContext` 的 rerank catch 块中各加一行：

```java
meterRegistry.ifPresent(registry ->
    Counter.builder("rag.rerank.fallback").register(registry).increment());
```

### 4.2 `rag.rollout.variant`

在 `buildPipelineContext` 中，`isHybridBucket()` 判断之后立即记录：

```java
String variant = isHybridBucket(tenantId, request.getSessionId()) ? "HYBRID" : "LEGACY";
meterRegistry.ifPresent(registry ->
    Counter.builder("rag.rollout.variant")
        .tag("variant", variant)
        .register(registry)
        .increment());
```

### 4.3 `rag.acl.filter_dropped`

在 legacy 路径的 ACL post-filter (`acl_post_filter` stage) 之后，计算差值：

```java
int dropped = milvusResults.size() - aclFiltered.size();
if (dropped > 0) {
    meterRegistry.ifPresent(registry ->
        Counter.builder("rag.acl.filter_dropped")
            .tag("channel", "DENSE")
            .register(registry)
            .increment(dropped));
}
```

hybrid 路径同理，在 ACL post-filter 之后对 `fusedSource.size() - aclFiltered.size()` 记录。

---

## 5. ReconcileJob (vector-service) — 一致性 Gauge

**文件：** `kb-mcp/vector-service/src/main/java/com/kb/vector/job/ReconcileJob.java`

**前置：** vector-service 的 `pom.xml` 需添加 `micrometer-registry-prometheus` 依赖。

在 `reconcileTenant` 完成后，用 `AtomicLong` 或直接使用 `MeterRegistry.gauge()` 注册：

```java
private final Optional<MeterRegistry> meterRegistry;
private final Map<String, AtomicLong> missingGauges = new ConcurrentHashMap<>();

// reconcileTenant 末尾
meterRegistry.ifPresent(registry -> {
    AtomicLong gauge = missingGauges.computeIfAbsent(tenantId, tid ->
        registry.gauge("rag.reconcile.missing_in_milvus",
            Tags.of("tenant", tid), new AtomicLong(0)));
    if (gauge != null) gauge.set(missingInMilvus);
});
```

---

## 6. Grafana 仪表板

**新建文件：** `kb-infra/grafana/dashboards/rag-hybrid-retrieval.json`

| Row | 面板 | PromQL |
|-----|------|--------|
| 1 总延迟 | P50/P95/P99（按 variant） | `histogram_quantile(0.50, rate(rag_pipeline_total_seconds_bucket[5m])) by (variant)` |
| 2 通道延迟 | 每通道 P95 + timeout rate | `histogram_quantile(0.95, rate(rag_channel_latency_seconds_bucket{channel="$channel"}[5m]))` |
| 3 健康 | 通道失败 + CB 状态 + planner fallback | `rate(rag_channel_failed_total[5m])` + `resilience4j_circuitbreaker_state` |
| 4 业务 | refusal 分布 + ACL drop + reconcile | `rate(rag_pipeline_refusal_total[5m])` + `rag_reconcile_missing_in_milvus` |

### 6.2 告警规则

**新建文件：** `kb-infra/grafana/alerts/rag-hybrid-retrieval.yaml`

```yaml
groups:
  - name: rag-hybrid-retrieval
    rules:
      - alert: HybridRetrievalDenseFailureHigh
        expr: rate(rag_channel_failed_total{channel="DENSE"}[5m]) > 0.1
        for: 5m
        severity: critical
        annotations:
          summary: "DENSE 通道失败率过高"

      - alert: HybridRetrievalPlannerCircuitOpen
        expr: increase(rag_planner_fallback_total[5m]) > 0
        severity: warning
        annotations:
          summary: "LLM Planner 熔断触发"

      - alert: HybridRetrievalRefusalSpike
        expr: rate(rag_pipeline_refusal_total[5m]) > 2 * avg_over_time(rate(rag_pipeline_refusal_total[5m])[1h:5m])
        for: 5m
        severity: warning
        annotations:
          summary: "拒答率异常飙升"

      - alert: ReconcileLagHigh
        expr: rag_reconcile_missing_in_milvus > 100
        for: 10m
        severity: warning
        annotations:
          summary: "PG-Milvus 数据不一致超过 100 条"
```

---

## 7. 实施顺序

1. ChannelExecutor — 4 个通道指标
2. HybridFusionService — 2 个融合指标
3. ChatServiceImpl — 3 个 rerank/rollout/ACL 指标
4. vector-service — 加 prometheus 依赖 + ReconcileJob Gauge
5. Grafana dashboard JSON + alert rules YAML
6. `mvn compile` + `mvn test` 验证两个服务

---

## 8. 改动文件清单

| 文件 | 操作 |
|------|------|
| `kb-mcp/rag-service/.../retrieval/ChannelExecutor.java` | 修改 — 添加 4 个指标 |
| `kb-mcp/rag-service/.../retrieval/fusion/HybridFusionService.java` | 修改 — 添加 2 个指标 |
| `kb-mcp/rag-service/.../service/ChatServiceImpl.java` | 修改 — 添加 3 个指标 |
| `kb-mcp/vector-service/pom.xml` | 修改 — 添加 prometheus 依赖 |
| `kb-mcp/vector-service/.../job/ReconcileJob.java` | 修改 — 添加 Gauge |
| `kb-infra/grafana/dashboards/rag-hybrid-retrieval.json` | 新建 |
| `kb-infra/grafana/alerts/rag-hybrid-retrieval.yaml` | 新建 |

---

## 9. 验证

- `mvn compile` 两个服务均通过
- `mvn test` 无新增失败
- 启动服务后 `curl /actuator/prometheus | grep rag_` 确认新指标出现
- Grafana JSON 为合法 JSON 格式

package com.kb.rag.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.dto.CitationDto;
import com.kb.rag.dto.RagPipelineTraceResponse;
import com.kb.rag.entity.RagPipelineTrace;
import com.kb.rag.repository.RagPipelineTraceRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;

@Slf4j
@Service
@RequiredArgsConstructor
public class PipelineTraceService {

    private static final TypeReference<List<Map<String, Object>>> JSON_LIST_TYPE = new TypeReference<>() {};
    private static final TypeReference<Map<String, Object>> JSON_MAP_TYPE = new TypeReference<>() {};

    private final RagPipelineTraceRepository traceRepository;
    private final ObjectMapper objectMapper;
    private final Optional<MeterRegistry> meterRegistry;

    public TraceContext start(String traceId, String tenantId, String uid, String sessionId,
                              String query, String spaceId, String lang, boolean stream) {
        return new TraceContext(traceId, tenantId, uid, sessionId, query, spaceId, lang, stream);
    }

    public void finish(TraceContext ctx) {
        ctx.finish();
        try {
            RagPipelineTrace trace = RagPipelineTrace.builder()
                    .traceId(ctx.traceId)
                    .tenantId(ctx.tenantId)
                    .uid(ctx.uid)
                    .sessionId(ctx.sessionId)
                    .queryText(ctx.query)
                    .rewrittenQuery(ctx.rewrittenQuery)
                    .spaceId(ctx.spaceId)
                    .lang(ctx.lang)
                    .cacheHit(ctx.cacheHit)
                    .stream(ctx.stream)
                    .result(ctx.result)
                    .refusalReason(ctx.refusalReason)
                    .totalMs(ctx.totalMs)
                    .firstTokenMs(ctx.firstTokenMs)
                    .stageTimings(objectMapper.writeValueAsString(ctx.stageTimings))
                    .recallCount(ctx.recallCount)
                    .aclFilteredCount(ctx.aclFilteredCount)
                    .rerankCount(ctx.rerankCount)
                    .citationsCount(ctx.citationsCount)
                    .hitDocs(objectMapper.writeValueAsString(ctx.hitDocs))
                    .promptBudget(objectMapper.writeValueAsString(ctx.promptBudget))
                    .errorMessage(ctx.errorMessage)
                    .createdAt(Instant.now())
                    .build();
            traceRepository.save(trace);
            recordSummaryMetrics(ctx);
            log.info("RAG_PIPELINE_SUMMARY traceId={} totalMs={} result={} cacheHit={} recall={} aclFiltered={} rerank={} citations={}",
                    ctx.traceId, ctx.totalMs, ctx.result, ctx.cacheHit, ctx.recallCount,
                    ctx.aclFilteredCount, ctx.rerankCount, ctx.citationsCount);
        } catch (Exception e) {
            log.warn("Failed to persist pipeline trace traceId={}: {}", ctx.traceId, e.getMessage());
        }
    }

    public Optional<RagPipelineTraceResponse> findByTraceId(String traceId) {
        return traceRepository.findByTraceId(traceId).map(this::toResponse);
    }

    private RagPipelineTraceResponse toResponse(RagPipelineTrace trace) {
        return RagPipelineTraceResponse.builder()
                .traceId(trace.getTraceId())
                .tenantId(trace.getTenantId())
                .uid(trace.getUid())
                .sessionId(trace.getSessionId())
                .queryText(trace.getQueryText())
                .rewrittenQuery(trace.getRewrittenQuery())
                .spaceId(trace.getSpaceId())
                .lang(trace.getLang())
                .cacheHit(trace.isCacheHit())
                .stream(trace.isStream())
                .result(trace.getResult())
                .refusalReason(trace.getRefusalReason())
                .totalMs(trace.getTotalMs())
                .firstTokenMs(trace.getFirstTokenMs())
                .stageTimings(readJsonList(trace.getStageTimings()))
                .recallCount(trace.getRecallCount())
                .aclFilteredCount(trace.getAclFilteredCount())
                .rerankCount(trace.getRerankCount())
                .citationsCount(trace.getCitationsCount())
                .hitDocs(readJsonList(trace.getHitDocs()))
                .promptBudget(readJsonMap(trace.getPromptBudget()))
                .errorMessage(trace.getErrorMessage())
                .createdAt(trace.getCreatedAt())
                .build();
    }

    private List<Map<String, Object>> readJsonList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, JSON_LIST_TYPE);
        } catch (Exception e) {
            return List.of();
        }
    }

    private Map<String, Object> readJsonMap(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, JSON_MAP_TYPE);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private void recordSummaryMetrics(TraceContext ctx) {
        meterRegistry.ifPresent(registry -> {
            String result = normalizeTag(ctx.result);
            Timer.builder("rag.pipeline.total")
                    .description("RAG pipeline total duration")
                    .tag("result", result)
                    .tag("cache_hit", String.valueOf(ctx.cacheHit))
                    .tag("stream", String.valueOf(ctx.stream))
                    .publishPercentileHistogram()
                    .register(registry)
                    .record(Duration.ofMillis(Math.max(ctx.totalMs, 0)));

            Counter.builder("rag.pipeline.request")
                    .description("RAG pipeline request count")
                    .tag("result", result)
                    .tag("cache_hit", String.valueOf(ctx.cacheHit))
                    .tag("stream", String.valueOf(ctx.stream))
                    .register(registry)
                    .increment();

            if (ctx.errorMessage != null) {
                Counter.builder("rag.pipeline.error")
                        .description("RAG pipeline error count")
                        .tag("stream", String.valueOf(ctx.stream))
                        .register(registry)
                        .increment();
            }

            if (ctx.refusalReason != null) {
                Counter.builder("rag.pipeline.refusal")
                        .description("RAG pipeline refusal count")
                        .tag("reason", normalizeTag(ctx.refusalReason))
                        .tag("stream", String.valueOf(ctx.stream))
                        .register(registry)
                        .increment();
            }
        });
    }

    private void recordStageMetric(String stage, String status, long durationMs) {
        meterRegistry.ifPresent(registry -> Timer.builder("rag.pipeline.stage")
                .description("RAG pipeline stage duration")
                .tag("stage", normalizeTag(stage))
                .tag("status", normalizeTag(status))
                .publishPercentileHistogram()
                .register(registry)
                .record(Duration.ofMillis(Math.max(durationMs, 0))));
    }

    private String normalizeTag(String value) {
        return value == null || value.isBlank() ? "none" : value;
    }

    @Getter
    public class TraceContext {
        private final String traceId;
        private final String tenantId;
        private final String uid;
        private String sessionId;
        private final String query;
        private final String spaceId;
        private final String lang;
        private final boolean stream;
        private final long startNs = System.nanoTime();
        private final List<Map<String, Object>> stageTimings = new ArrayList<>();
        private final List<Map<String, Object>> hitDocs = new ArrayList<>();
        private Map<String, Object> promptBudget = new LinkedHashMap<>();
        private boolean cacheHit;
        private String result = "IN_PROGRESS";
        private String refusalReason;
        private String rewrittenQuery;
        private long totalMs;
        private Long firstTokenMs;
        private int recallCount;
        private int aclFilteredCount;
        private int rerankCount;
        private int citationsCount;
        private String errorMessage;
        private boolean finished;

        private TraceContext(String traceId, String tenantId, String uid, String sessionId,
                             String query, String spaceId, String lang, boolean stream) {
            this.traceId = traceId;
            this.tenantId = tenantId;
            this.uid = uid;
            this.sessionId = sessionId;
            this.query = query;
            this.spaceId = spaceId;
            this.lang = lang == null ? "zh" : lang;
            this.stream = stream;
        }

        public <T> T stage(String stage, Supplier<T> supplier) {
            return stage(stage, null, supplier);
        }

        public <T> T stage(String stage, Map<String, Object> metadata, Supplier<T> supplier) {
            long started = System.nanoTime();
            try {
                T value = supplier.get();
                recordStage(stage, "SUCCESS", started, null, metadata);
                return value;
            } catch (RuntimeException e) {
                recordStage(stage, "ERROR", started, e.getMessage(), metadata);
                throw e;
            }
        }

        public void stage(String stage, Runnable runnable) {
            stage(stage, () -> {
                runnable.run();
                return null;
            });
        }

        public void setCacheHit(boolean cacheHit) {
            this.cacheHit = cacheHit;
        }

        public void setResult(String result) {
            this.result = result;
        }

        public void setRefusalReason(String refusalReason) {
            this.refusalReason = refusalReason;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }

        public void setRewrittenQuery(String rewrittenQuery) {
            this.rewrittenQuery = rewrittenQuery;
        }

        public void setCounts(int recallCount, int aclFilteredCount, int rerankCount, int citationsCount) {
            this.recallCount = recallCount;
            this.aclFilteredCount = aclFilteredCount;
            this.rerankCount = rerankCount;
            this.citationsCount = citationsCount;
        }

        public void setHitDocs(List<CitationDto> citations) {
            hitDocs.clear();
            if (citations == null) return;
            citations.stream().limit(12).forEach(c -> {
                Map<String, Object> doc = new LinkedHashMap<>();
                doc.put("docId", c.getDocId());
                doc.put("title", c.getTitle());
                doc.put("score", c.getScore());
                doc.put("version", c.getVersion());
                doc.put("page", c.getPage());
                doc.put("spacePath", c.getSpacePath());
                hitDocs.add(doc);
            });
        }

        public void setPromptBudget(PromptBudgetPlanner.PromptBudgetStats stats) {
            if (stats == null) {
                promptBudget = new LinkedHashMap<>();
                return;
            }

            Map<String, Object> budget = new LinkedHashMap<>();
            budget.put("enabled", stats.enabled());
            budget.put("inputBudgetTokens", stats.inputBudgetTokens());
            budget.put("estimatedPromptTokens", stats.estimatedPromptTokens());
            budget.put("includedHistoryTurns", stats.includedHistoryTurns());
            budget.put("droppedHistoryTurns", stats.droppedHistoryTurns());
            budget.put("includedCitations", stats.includedCitations());
            budget.put("droppedCitations", stats.droppedCitations());
            budget.put("truncatedCitations", stats.truncatedCitations());
            promptBudget = budget;
            addStageMetadata("prompt_build", Map.of("promptBudget", budget));
        }

        public void markFirstToken() {
            if (firstTokenMs == null) {
                firstTokenMs = elapsedMs(startNs);
            }
        }

        public void markError(Exception e) {
            result = "ERROR";
            errorMessage = e.getMessage();
        }

        private void finish() {
            if (finished) return;
            finished = true;
            totalMs = elapsedMs(startNs);
        }

        private void recordStage(String stage, String status, long started, String errorMessage,
                                 Map<String, Object> metadata) {
            long durationMs = elapsedMs(started);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("stage", stage);
            item.put("status", status);
            item.put("durationMs", durationMs);
            if (errorMessage != null) item.put("errorMessage", errorMessage);
            if (metadata != null && !metadata.isEmpty()) item.put("metadata", metadata);
            stageTimings.add(item);
            recordStageMetric(stage, status, durationMs);
            log.info("RAG_PIPELINE traceId={} stage={} costMs={} status={}",
                    traceId, stage, durationMs, status);
        }

        @SuppressWarnings("unchecked")
        private void addStageMetadata(String stage, Map<String, Object> metadata) {
            if (metadata == null || metadata.isEmpty()) return;
            for (int i = stageTimings.size() - 1; i >= 0; i--) {
                Map<String, Object> item = stageTimings.get(i);
                if (!stage.equals(item.get("stage"))) {
                    continue;
                }
                Object existing = item.get("metadata");
                if (existing instanceof Map<?, ?> existingMap) {
                    ((Map<String, Object>) existingMap).putAll(metadata);
                } else {
                    item.put("metadata", new LinkedHashMap<>(metadata));
                }
                return;
            }
        }

        private long elapsedMs(long startedNs) {
            return (System.nanoTime() - startedNs) / 1_000_000;
        }
    }
}

package com.kb.rag.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.config.EvalProperties;
import com.kb.rag.dto.*;
import com.kb.rag.entity.EvalQaPair;
import com.kb.rag.entity.EvalQaResult;
import com.kb.rag.entity.EvalRun;
import com.kb.rag.repository.EvalQaPairRepository;
import com.kb.rag.repository.EvalQaResultRepository;
import com.kb.rag.repository.EvalRunRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

@Slf4j
@Service
@RequiredArgsConstructor
public class EvalRunnerService {

    private final EvalRunRepository runRepo;
    private final EvalQaPairRepository qaPairRepo;
    private final EvalQaResultRepository resultRepo;
    private final ChatService chatService;
    private final EvalProperties evalProperties;
    private final ObjectMapper objectMapper;

    @Transactional
    public EvalRunResponse createRun(CreateEvalRunRequest request) {
        String runId = "run-" + UUID.randomUUID().toString().substring(0, 8);
        EvalRun run = EvalRun.builder()
                .runId(runId)
                .datasetId(request.getDatasetId())
                .tenantId(request.getTenantId() != null ? request.getTenantId() : "default")
                .config(toJson(request.getConfig()))
                .build();
        run = runRepo.save(run);
        return toResponse(run);
    }

    public void execute(String runId, Consumer<StageEvent> onStage,
                        Consumer<Map<String, Object>> onComplete,
                        Consumer<Exception> onError) {
        EvalRun run = runRepo.findByRunId(runId)
                .orElseThrow(() -> new NoSuchElementException("Run not found: " + runId));

        try {
            run.setStatus("RUNNING");
            run.setStartedAt(Instant.now());
            runRepo.save(run);

            // Load QA pairs
            List<EvalQaPair> pairs = loadAllQaPairs(run.getDatasetId());
            int total = pairs.size();
            run.setProgress(toJson(Map.of("completedQa", 0, "totalQa", total)));
            runRepo.save(run);

            // Execute evaluation
            List<EvalQaResult> results = Collections.synchronizedList(new ArrayList<>());
            AtomicInteger completed = new AtomicInteger(0);
            long runStart = System.currentTimeMillis();

            for (EvalQaPair pair : pairs) {
                try {
                    EvalQaResult result = evaluateSingle(pair, run.getRunId(), toMap(run.getConfig()));
                    results.add(result);
                } catch (Exception e) {
                    log.warn("Eval failed for pair {}: {}", pair.getPairId(), e.getMessage());
                    results.add(EvalQaResult.builder()
                            .runId(runId)
                            .pairId(pair.getPairId())
                            .llmJudgeReason("Evaluation error: " + e.getMessage())
                            .build());
                }

                int done = completed.incrementAndGet();
                if (done % 10 == 0 || done == total) {
                    run.setProgress(toJson(Map.of("completedQa", done, "totalQa", total)));
                    runRepo.save(run);
                    onStage.accept(StageEvent.builder()
                            .stage("EVALUATE")
                            .status("RUNNING")
                            .elapsedMs(System.currentTimeMillis() - runStart)
                            .summary(Map.of("completedQa", done, "totalQa", total))
                            .build());
                }
            }

            // Save results
            resultRepo.saveAll(results);

            // Compute metrics
            Map<String, Object> metrics = computeMetrics(results);
            run.setStatus("COMPLETED");
            run.setCompletedAt(Instant.now());
            run.setMetrics(toJson(metrics));
            run.setProgress(toJson(Map.of("completedQa", total, "totalQa", total)));
            runRepo.save(run);

            onComplete.accept(Map.of("runId", runId, "metrics", metrics));

        } catch (Exception e) {
            log.error("Eval run {} failed: {}", runId, e.getMessage());
            run.setStatus("FAILED");
            runRepo.save(run);
            onError.accept(e);
        }
    }

    public EvalRunResponse getRun(String runId) {
        EvalRun run = runRepo.findByRunId(runId)
                .orElseThrow(() -> new NoSuchElementException("Run not found: " + runId));
        return toResponse(run);
    }

    public List<EvalRunResponse> listRuns(String datasetId) {
        return runRepo.findByDatasetIdOrderByCreatedAtDesc(datasetId).stream()
                .map(this::toResponse).toList();
    }

    public Map<String, Object> listResults(String runId, int page, int size) {
        Page<EvalQaResult> result = resultRepo.findByRunId(runId, PageRequest.of(page, size));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", result.getContent());
        body.put("total", result.getTotalElements());
        body.put("page", result.getNumber());
        body.put("size", result.getSize());
        return body;
    }

    // --- Private helpers ---

    private EvalQaResult evaluateSingle(EvalQaPair pair, String runId, Map<String, Object> config) {
        long start = System.currentTimeMillis();
        try {
            ChatRequest req = new ChatRequest();
            req.setTenantId("default");
            req.setQuery(pair.getQuestion());
            if (config.containsKey("spaceId")) {
                req.setSpaceId((String) config.get("spaceId"));
            }
            if (config.containsKey("topK")) {
                req.setTopK(((Number) config.get("topK")).intValue());
            }

            ChatResponse resp = chatService.chat(req);
            long latency = System.currentTimeMillis() - start;

            String ragAnswer = resp.getAnswer();
            boolean exactMatch = normalize(ragAnswer).contains(normalize(pair.getAnswer()))
                    || normalize(pair.getAnswer()).contains(normalize(ragAnswer));

            return EvalQaResult.builder()
                    .runId(runId)
                    .pairId(pair.getPairId())
                    .ragAnswer(ragAnswer)
                    .ragTraceId(resp.getTraceId())
                    .exactMatch(exactMatch)
                    .citationsCount(resp.getCitations() != null ? resp.getCitations().size() : 0)
                    .latencyMs(latency)
                    .build();
        } catch (Exception e) {
            return EvalQaResult.builder()
                    .runId(runId)
                    .pairId(pair.getPairId())
                    .latencyMs(System.currentTimeMillis() - start)
                    .llmJudgeReason("RAG call failed: " + e.getMessage())
                    .build();
        }
    }

    private Map<String, Object> computeMetrics(List<EvalQaResult> results) {
        long total = results.size();
        long exactMatchCount = results.stream().filter(r -> Boolean.TRUE.equals(r.getExactMatch())).count();
        double avgLatency = results.stream().mapToLong(r -> r.getLatencyMs() != null ? r.getLatencyMs() : 0).average().orElse(0);
        double avgCitations = results.stream().mapToInt(r -> r.getCitationsCount() != null ? r.getCitationsCount() : 0).average().orElse(0);
        double avgLlmScore = results.stream().mapToDouble(r -> r.getLlmJudgeScore() != null ? r.getLlmJudgeScore() : 0).average().orElse(0);

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("totalQa", total);
        metrics.put("exactMatchRate", total > 0 ? (double) exactMatchCount / total : 0);
        metrics.put("avgLatencyMs", Math.round(avgLatency));
        metrics.put("avgCitationsCount", Math.round(avgCitations * 100.0) / 100.0);
        metrics.put("avgLlmJudgeScore", Math.round(avgLlmScore * 100.0) / 100.0);
        return metrics;
    }

    private List<EvalQaPair> loadAllQaPairs(String datasetId) {
        List<EvalQaPair> all = new ArrayList<>();
        int page = 0;
        while (true) {
            Page<EvalQaPair> result = qaPairRepo.findByDatasetId(datasetId, PageRequest.of(page, 200));
            all.addAll(result.getContent());
            if (!result.hasNext()) break;
            page++;
        }
        return all;
    }

    private EvalRunResponse toResponse(EvalRun run) {
        return EvalRunResponse.builder()
                .runId(run.getRunId())
                .datasetId(run.getDatasetId())
                .tenantId(run.getTenantId())
                .status(run.getStatus())
                .config(toMap(run.getConfig()))
                .metrics(toMap(run.getMetrics()))
                .progress(toMap(run.getProgress()))
                .startedAt(run.getStartedAt())
                .completedAt(run.getCompletedAt())
                .createdAt(run.getCreatedAt())
                .build();
    }

    private String normalize(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").toLowerCase();
    }

    private String toJson(Object obj) {
        try { return objectMapper.writeValueAsString(obj); } catch (Exception e) { return "{}"; }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> toMap(String json) {
        try { return json != null ? objectMapper.readValue(json, Map.class) : new HashMap<>(); } catch (Exception e) { return new HashMap<>(); }
    }
}

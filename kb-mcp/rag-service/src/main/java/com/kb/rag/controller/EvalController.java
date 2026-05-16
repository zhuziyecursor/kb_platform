package com.kb.rag.controller;

import com.kb.rag.dto.*;
import com.kb.rag.service.EvalDatasetService;
import com.kb.rag.service.EvalGenerationPipeline;
import com.kb.rag.service.EvalRunnerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@RestController
@RequestMapping("/rag/v1/eval")
@RequiredArgsConstructor
public class EvalController {

    private final EvalDatasetService datasetService;
    private final EvalGenerationPipeline generationPipeline;
    private final EvalRunnerService runnerService;
    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();

    // ========== Dataset CRUD ==========

    @PostMapping("/datasets")
    public ResponseEntity<DatasetResponse> createDataset(@Valid @RequestBody CreateDatasetRequest request) {
        return ResponseEntity.ok(datasetService.createDataset(request));
    }

    @GetMapping("/datasets")
    public ResponseEntity<Map<String, Object>> listDatasets(
            @RequestParam(defaultValue = "default") String tenantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(datasetService.listDatasets(tenantId, page, size));
    }

    @GetMapping("/datasets/{datasetId}")
    public ResponseEntity<DatasetResponse> getDataset(@PathVariable String datasetId) {
        return ResponseEntity.ok(datasetService.getDataset(datasetId));
    }

    @DeleteMapping("/datasets/{datasetId}")
    public ResponseEntity<Void> deleteDataset(@PathVariable String datasetId) {
        datasetService.deleteDataset(datasetId);
        return ResponseEntity.noContent().build();
    }

    // ========== Generation SSE ==========

    @PostMapping(value = "/datasets/{datasetId}/generate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generateDataset(@PathVariable String datasetId) {
        SseEmitter emitter = new SseEmitter(3_600_000L); // 60 min timeout

        sseExecutor.execute(() -> {
            generationPipeline.execute(datasetId,
                    stageEvent -> {
                        try {
                            emitter.send(SseEmitter.event().name("stage").data(stageEvent));
                        } catch (Exception ignored) {
                            // Emitter already completed or client disconnected — continue pipeline
                        }
                    },
                    result -> {
                        try {
                            emitter.send(SseEmitter.event().name("done").data(result));
                            emitter.complete();
                        } catch (IOException e) {
                            emitter.completeWithError(e);
                        }
                    },
                    error -> {
                        log.error("Generation failed for dataset {}: {}", datasetId, error.getMessage());
                        try {
                            emitter.send(SseEmitter.event().name("error")
                                    .data(Map.of("message", "数据集生成失败: " + error.getMessage())));
                            emitter.complete();
                        } catch (IOException ignored) {
                            emitter.completeWithError(error);
                        }
                    }
            );
        });

        return emitter;
    }

    @GetMapping("/datasets/{datasetId}/progress")
    public ResponseEntity<Map<String, Object>> getProgress(@PathVariable String datasetId) {
        DatasetResponse ds = datasetService.getDataset(datasetId);
        return ResponseEntity.ok(Map.of(
                "status", ds.getStatus(),
                "progress", ds.getProgress()
        ));
    }

    // ========== QA Pairs ==========

    @GetMapping("/datasets/{datasetId}/pairs")
    public ResponseEntity<Map<String, Object>> listQaPairs(
            @PathVariable String datasetId,
            @RequestParam(required = false) String qaType,
            @RequestParam(required = false) String difficulty,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(datasetService.listQaPairs(datasetId, qaType, difficulty, page, size));
    }

    // ========== Evaluation Runs ==========

    @PostMapping("/runs")
    public ResponseEntity<EvalRunResponse> createEvalRun(@Valid @RequestBody CreateEvalRunRequest request) {
        return ResponseEntity.ok(runnerService.createRun(request));
    }

    @PostMapping(value = "/runs/{runId}/execute", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter executeEvalRun(@PathVariable String runId) {
        SseEmitter emitter = new SseEmitter(3_600_000L);

        sseExecutor.execute(() -> {
            runnerService.execute(runId,
                    stageEvent -> {
                        try {
                            emitter.send(SseEmitter.event().name("stage").data(stageEvent));
                        } catch (Exception ignored) {
                            // Emitter already completed or client disconnected — continue pipeline
                        }
                    },
                    result -> {
                        try {
                            emitter.send(SseEmitter.event().name("done").data(result));
                            emitter.complete();
                        } catch (IOException e) {
                            emitter.completeWithError(e);
                        }
                    },
                    error -> {
                        log.error("Eval run failed for {}: {}", runId, error.getMessage());
                        try {
                            emitter.send(SseEmitter.event().name("error")
                                    .data(Map.of("message", "评测运行失败: " + error.getMessage())));
                            emitter.complete();
                        } catch (IOException ignored) {
                            emitter.completeWithError(error);
                        }
                    }
            );
        });

        return emitter;
    }

    @GetMapping("/runs/{runId}")
    public ResponseEntity<EvalRunResponse> getEvalRun(@PathVariable String runId) {
        return ResponseEntity.ok(runnerService.getRun(runId));
    }

    @GetMapping("/datasets/{datasetId}/runs")
    public ResponseEntity<List<EvalRunResponse>> listEvalRuns(@PathVariable String datasetId) {
        return ResponseEntity.ok(runnerService.listRuns(datasetId));
    }

    // ========== Evaluation Results ==========

    @GetMapping("/runs/{runId}/results")
    public ResponseEntity<Map<String, Object>> listEvalResults(
            @PathVariable String runId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(runnerService.listResults(runId, page, size));
    }
}

package com.kb.rag.controller;

import com.kb.rag.dto.*;
import com.kb.rag.entity.BadcaseArchive;
import com.kb.rag.repository.BadcaseArchiveRepository;
import com.kb.rag.repository.DocAuditLogRepository;
import com.kb.rag.repository.RagFeedbackRepository;
import com.kb.rag.repository.RagPipelineTraceRepository;
import com.kb.rag.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@RestController
@RequestMapping("/rag/v1")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final SessionService sessionService;
    private final PipelineTraceService pipelineTraceService;
    private final FeedbackService feedbackService;
    private final AnalyticsService analyticsService;
    private final FaqStore faqStore;
    private final BadcaseService badcaseService;
    private final AlertService alertService;
    private final DocAuditLogRepository docAuditLogRepository;
    private final BadcaseArchiveRepository badcaseArchiveRepository;
    private final RagFeedbackRepository ragFeedbackRepository;
    private final RagPipelineTraceRepository ragPipelineTraceRepository;
    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();

    @PostMapping("/chat")
    public ResponseEntity<ChatResponse> chat(@Valid @RequestBody ChatRequest request) {
        ChatResponse response = chatService.chat(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStream(@Valid @RequestBody ChatRequest request) {
        SseEmitter emitter = new SseEmitter(120_000L);

        sseExecutor.execute(() -> {
            try {
                chatService.chatStream(request,
                        token -> {
                            try {
                                emitter.send(SseEmitter.event()
                                        .name("token")
                                        .data(Map.of("token", token)));
                            } catch (IOException e) {
                                throw new RuntimeException(e);
                            }
                        },
                        result -> {
                            try {
                                emitter.send(SseEmitter.event()
                                        .name("done")
                                        .data(result));
                                emitter.complete();
                            } catch (IOException e) {
                                emitter.completeWithError(e);
                            }
                        },
                        error -> {
                            log.error("SSE stream error for query '{}': {}", request.getQuery(), error.getMessage());
                            try {
                                emitter.send(SseEmitter.event()
                                        .name("error")
                                        .data(Map.of("message", "处理请求时出现错误，请稍后重试。")));
                                emitter.complete();
                            } catch (IOException ignored) {
                                emitter.completeWithError(error);
                            }
                        },
                        stageEvent -> {
                            try {
                                emitter.send(SseEmitter.event()
                                        .name("stage")
                                        .data(stageEvent));
                            } catch (IOException ignored) {
                                // Client disconnected; pipeline continues but stage events are dropped.
                            }
                        }
                );
            } catch (Exception e) {
                log.error("SSE executor error: {}", e.getMessage());
                try {
                    emitter.send(SseEmitter.event()
                            .name("error")
                            .data(Map.of("message", "处理请求时出现错误，请稍后重试。")));
                    emitter.complete();
                } catch (IOException ignored) {
                    emitter.completeWithError(e);
                }
            }
        });

        return emitter;
    }

    @GetMapping("/sessions")
    public ResponseEntity<List<Map<String, Object>>> listSessions(
            @RequestParam String tenantId,
            @RequestParam String userId) {
        return ResponseEntity.ok(sessionService.listSessions(tenantId, userId));
    }

    @PostMapping("/sessions")
    public ResponseEntity<Map<String, String>> createSession(@RequestBody Map<String, String> body) {
        String tenantId = body.get("tenantId");
        String userId = body.get("userId");
        String sessionId = sessionService.createSession(tenantId, userId);
        return ResponseEntity.ok(Map.of("sessionId", sessionId));
    }

    @GetMapping("/sessions/{sessionId}/messages")
    public ResponseEntity<List<Map<String, Object>>> getMessages(
            @PathVariable String sessionId,
            @RequestParam String tenantId) {
        return ResponseEntity.ok(sessionService.getMessages(sessionId, tenantId));
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Void> deleteSession(
            @PathVariable String sessionId,
            @RequestParam String tenantId) {
        sessionService.deleteSession(sessionId, tenantId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/traces/{traceId}")
    public ResponseEntity<RagPipelineTraceResponse> getPipelineTrace(@PathVariable String traceId) {
        return pipelineTraceService.findByTraceId(traceId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/traces")
    public ResponseEntity<Map<String, Object>> listTraces(
            @RequestParam String tenantId,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Instant fromInstant = from != null ? Instant.parse(from) : Instant.EPOCH;
        Instant toInstant = to != null ? Instant.parse(to) : Instant.now().plus(365, ChronoUnit.DAYS);
        var pageResult = ragPipelineTraceRepository.findTraceSummaries(
                tenantId, result, fromInstant, toInstant,
                PageRequest.of(page, size));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", pageResult.getContent());
        body.put("total", pageResult.getTotalElements());
        body.put("page", pageResult.getNumber());
        body.put("size", pageResult.getSize());
        return ResponseEntity.ok(body);
    }

    // ============== Feedback APIs ==============

    @PostMapping("/feedback")
    public ResponseEntity<FeedbackResponse> submitFeedback(@Valid @RequestBody FeedbackRequest request) {
        FeedbackResponse response = feedbackService.submit(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/feedback/{traceId}")
    public ResponseEntity<FeedbackResponse> getFeedback(@PathVariable String traceId) {
        return feedbackService.findByTraceId(traceId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/feedback/list")
    public ResponseEntity<Map<String, Object>> listFeedback(
            @RequestParam String tenantId,
            @RequestParam(required = false) String feedbackType,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Instant fromInstant = from != null ? Instant.parse(from) : Instant.EPOCH;
        Instant toInstant = to != null ? Instant.parse(to) : Instant.now().plus(365, ChronoUnit.DAYS);
        var pageResult = ragFeedbackRepository.findFeedback(
                tenantId, feedbackType, fromInstant, toInstant,
                PageRequest.of(page, size));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", pageResult.getContent());
        body.put("total", pageResult.getTotalElements());
        body.put("page", pageResult.getNumber());
        body.put("size", pageResult.getSize());
        return ResponseEntity.ok(body);
    }

    // ============== Badcase APIs ==============

    @GetMapping("/badcases")
    public ResponseEntity<Map<String, Object>> listBadcases(
            @RequestParam String tenantId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String feedbackType,
            @RequestParam(required = false) String reportReason,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Instant fromInstant = from != null ? Instant.parse(from) : Instant.EPOCH;
        Instant toInstant = to != null ? Instant.parse(to) : Instant.now().plus(365, ChronoUnit.DAYS);
        var pageResult = badcaseArchiveRepository.findBadcases(
                tenantId, status, feedbackType, reportReason,
                fromInstant, toInstant,
                org.springframework.data.domain.PageRequest.of(page, size));

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("items", pageResult.getContent());
        result.put("total", pageResult.getTotalElements());
        result.put("page", pageResult.getNumber());
        result.put("size", pageResult.getSize());
        return ResponseEntity.ok(result);
    }

    @PatchMapping("/badcases/{id}/status")
    public ResponseEntity<Map<String, Object>> updateBadcaseStatus(
            @PathVariable Long id,
            @Valid @RequestBody BadcaseStatusRequest request) {
        BadcaseArchive updated = badcaseService.updateStatus(id, request.getStatus());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", updated.getId());
        body.put("status", updated.getStatus());
        body.put("updatedAt", updated.getUpdatedAt());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/badcases/export")
    public ResponseEntity<String> exportBadcases(
            @RequestParam String tenantId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String feedbackType,
            @RequestParam(required = false) String reportReason,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        Instant fromInstant = from != null ? Instant.parse(from) : Instant.EPOCH;
        Instant toInstant = to != null ? Instant.parse(to) : Instant.now().plus(365, ChronoUnit.DAYS);

        String csv = badcaseService.exportCsv(tenantId, status, feedbackType,
                reportReason, fromInstant, toInstant);

        return ResponseEntity.ok()
                .header("Content-Type", "text/csv; charset=UTF-8")
                .header("Content-Disposition", "attachment; filename=badcases.csv")
                .body(csv);
    }

    // ============== Doc Audit APIs ==============

    @GetMapping("/docs/audit")
    public ResponseEntity<Map<String, Object>> listDocAudit(
            @RequestParam String tenantId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String result,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        var pageResult = docAuditLogRepository.findAuditLogs(
                tenantId, action, result, PageRequest.of(page, size));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", pageResult.getContent());
        body.put("total", pageResult.getTotalElements());
        body.put("page", pageResult.getNumber());
        body.put("size", pageResult.getSize());
        return ResponseEntity.ok(body);
    }

    // ============== Alert APIs ==============

    @GetMapping("/alerts")
    public ResponseEntity<Map<String, Object>> listAlerts(
            @RequestParam String tenantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        var pageResult = alertService.listAlerts(tenantId, page, size);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", pageResult.getContent());
        body.put("total", pageResult.getTotalElements());
        body.put("page", pageResult.getNumber());
        body.put("size", pageResult.getSize());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/alerts/{alertId}/resolve")
    public ResponseEntity<Map<String, String>> resolveAlert(@PathVariable Long alertId) {
        alertService.resolveAlert(alertId);
        return ResponseEntity.ok(Map.of("status", "resolved"));
    }

    // ============== Analytics APIs ==============

    @GetMapping("/analytics/top-queries")
    public ResponseEntity<List<TopQueriesResponse>> getTopQueries(
            @RequestParam String tenantId,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String spaceId) {
        return ResponseEntity.ok(analyticsService.getTopQueries(tenantId, days, limit, spaceId));
    }

    @GetMapping("/analytics/dashboard")
    public ResponseEntity<DashboardMetrics> getDashboardMetrics(
            @RequestParam String tenantId,
            @RequestParam(defaultValue = "7days") String period,
            @RequestParam(defaultValue = "10") int slowQueryLimit) {
        return ResponseEntity.ok(analyticsService.getDashboardMetrics(tenantId, period, slowQueryLimit));
    }

    @GetMapping("/analytics/question-clusters")
    public ResponseEntity<List<QuestionCluster>> getQuestionClusters(
            @RequestParam String tenantId,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "2") int minCount,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(analyticsService.getQuestionClusters(tenantId, days, minCount, limit));
    }

    @GetMapping("/analytics/user-behavior")
    public ResponseEntity<UserBehaviorResponse> getUserBehavior(
            @RequestParam String tenantId,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(analyticsService.getUserBehavior(tenantId, days, limit));
    }

    // ============== FAQ Management APIs (A.2) ==============

    @GetMapping("/faq")
    public ResponseEntity<List<Map<String, Object>>> listFaqs(@RequestParam String tenantId) {
        List<Map<String, Object>> faqs = faqStore.getEntries(tenantId).stream()
                .map(e -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("id", e.id());
                    m.put("question", e.question());
                    m.put("answer", e.answer());
                    m.put("spaceId", e.spaceId());
                    m.put("hitCount", e.hitCount());
                    m.put("hasEmbedding", e.embedding() != null && !e.embedding().isEmpty());
                    return m;
                })
                .toList();
        return ResponseEntity.ok(faqs);
    }
}

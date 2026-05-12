package com.kb.rag.controller;

import com.kb.rag.dto.*;
import com.kb.rag.repository.BadcaseArchiveRepository;
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
    private final BadcaseArchiveRepository badcaseArchiveRepository;
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
                            } catch (IOException ignored) {
                            }
                            emitter.completeWithError(error);
                        }
                );
            } catch (Exception e) {
                log.error("SSE executor error: {}", e.getMessage());
                try {
                    emitter.send(SseEmitter.event()
                            .name("error")
                            .data(Map.of("message", "处理请求时出现错误，请稍后重试。")));
                } catch (IOException ignored) {
                }
                emitter.completeWithError(e);
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

        Instant fromInstant = from != null ? Instant.parse(from) : null;
        Instant toInstant = to != null ? Instant.parse(to) : null;
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

    // ============== Analytics APIs ==============

    @GetMapping("/analytics/top-queries")
    public ResponseEntity<List<TopQueriesResponse>> getTopQueries(
            @RequestParam String tenantId,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String spaceId) {
        return ResponseEntity.ok(analyticsService.getTopQueries(tenantId, days, limit, spaceId));
    }
}

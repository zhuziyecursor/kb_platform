package com.kb.llm.controller;

import com.kb.llm.dto.*;
import com.kb.llm.service.AuditService;
import com.kb.llm.service.MinimaxProviderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@RestController
@RequestMapping("/llm/v1")
@RequiredArgsConstructor
public class ChatController {

    private final MinimaxProviderService minimaxService;
    private final AuditService auditService;
    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();

    @PostMapping("/chat/completions")
    public ResponseEntity<?> chatCompletions(
            @Valid @RequestBody ChatCompletionRequest request,
            @RequestHeader(value = "X-Trace-Id", required = false) String traceId,
            @RequestHeader(value = "X-Tenant-Id", required = false) String tenantId) {

        if (traceId == null || traceId.isEmpty()) {
            traceId = "tr-" + UUID.randomUUID();
        }
        if (tenantId == null || tenantId.isEmpty()) {
            tenantId = "unknown";
        }

        long start = System.currentTimeMillis();
        String status = "SUCCESS";
        String errorCode = null;
        ChatCompletionResponse result = null;

        try {
            MinimaxRequest minimaxReq = minimaxService.buildRequest(request);
            MinimaxResponse minimaxResp = minimaxService.chat(minimaxReq);

            result = mapToResponse(minimaxResp);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            status = "FAILED";
            errorCode = "LLM_ERROR";
            log.error("Chat completion failed: {}", e.getMessage());
            throw e;
        } finally {
            long latency = System.currentTimeMillis() - start;
            AuditLogEntry audit = AuditLogEntry.builder()
                    .traceId(traceId)
                    .tenantId(tenantId)
                    .model(request.getModel())
                    .provider("minimax")
                    .promptTokens(result != null && result.getUsage() != null
                            ? result.getUsage().getPromptTokens() : 0)
                    .completionTokens(result != null && result.getUsage() != null
                            ? result.getUsage().getCompletionTokens() : 0)
                    .latencyMs(latency)
                    .status(status)
                    .errorCode(errorCode)
                    .build();
            auditService.log(audit);
        }
    }

    @PostMapping(value = "/chat/completions/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatCompletionsStream(
            @Valid @RequestBody ChatCompletionRequest request,
            @RequestHeader(value = "X-Trace-Id", required = false) String traceId,
            @RequestHeader(value = "X-Tenant-Id", required = false) String tenantId) {

        if (traceId == null || traceId.isEmpty()) {
            traceId = "tr-" + UUID.randomUUID();
        }
        if (tenantId == null || tenantId.isEmpty()) {
            tenantId = "unknown";
        }

        final String finalTraceId = traceId;
        final String finalTenantId = tenantId;
        SseEmitter emitter = new SseEmitter(120_000L);

        sseExecutor.execute(() -> {
            long start = System.currentTimeMillis();
            String status = "SUCCESS";
            String errorCode = null;
            int completionTokens = 0;

            try {
                MinimaxRequest minimaxReq = minimaxService.buildRequest(request);
                minimaxService.chatStream(minimaxReq, token -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name("token")
                                .data(Map.of("token", token)));
                    } catch (IOException e) {
                        throw new RuntimeException(e);
                    }
                });

                emitter.send(SseEmitter.event()
                        .name("done")
                        .data(Map.of("traceId", finalTraceId)));
                emitter.complete();
            } catch (Exception e) {
                status = "FAILED";
                errorCode = "LLM_STREAM_ERROR";
                log.error("Chat completion stream failed: {}", e.getMessage());
                emitter.completeWithError(e);
            } finally {
                long latency = System.currentTimeMillis() - start;
                AuditLogEntry audit = AuditLogEntry.builder()
                        .traceId(finalTraceId)
                        .tenantId(finalTenantId)
                        .model(request.getModel())
                        .provider("minimax")
                        .promptTokens(0) // TODO: count prompt tokens for stream
                        .completionTokens(completionTokens)
                        .latencyMs(latency)
                        .status(status)
                        .errorCode(errorCode)
                        .build();
                auditService.log(audit);
            }
        });

        return emitter;
    }

    private ChatCompletionResponse mapToResponse(MinimaxResponse minimaxResp) {
        ChatCompletionResponse.Choice choice = null;
        if (minimaxResp.getChoices() != null && !minimaxResp.getChoices().isEmpty()) {
            MinimaxResponse.Choice c = minimaxResp.getChoices().get(0);
            Message msg = new Message();
            if (c.getMessage() != null) {
                msg.setRole(c.getMessage().getRole());
                msg.setContent(c.getMessage().getContent());
            }
            choice = ChatCompletionResponse.Choice.builder()
                    .finishReason(c.getFinishReason())
                    .message(msg)
                    .build();
        }

        ChatCompletionResponse.Usage usage = null;
        if (minimaxResp.getUsage() != null) {
            usage = ChatCompletionResponse.Usage.builder()
                    .promptTokens(minimaxResp.getUsage().getPromptTokens())
                    .completionTokens(minimaxResp.getUsage().getCompletionTokens())
                    .totalTokens(minimaxResp.getUsage().getTotalTokens())
                    .build();
        }

        return ChatCompletionResponse.builder()
                .id(minimaxResp.getId())
                .model(minimaxResp.getModel())
                .choice(choice)
                .usage(usage)
                .build();
    }
}

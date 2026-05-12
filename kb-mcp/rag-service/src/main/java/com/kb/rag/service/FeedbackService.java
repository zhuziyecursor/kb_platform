package com.kb.rag.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.config.DevContextProperties;
import com.kb.rag.dto.FeedbackRequest;
import com.kb.rag.dto.FeedbackResponse;
import com.kb.rag.entity.BadcaseArchive;
import com.kb.rag.entity.RagFeedback;
import com.kb.rag.entity.RagMessage;
import com.kb.rag.entity.RagPipelineTrace;
import com.kb.rag.repository.BadcaseArchiveRepository;
import com.kb.rag.repository.RagFeedbackRepository;
import com.kb.rag.repository.RagMessageRepository;
import com.kb.rag.repository.RagPipelineTraceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class FeedbackService {

    private final RagFeedbackRepository feedbackRepository;
    private final BadcaseArchiveRepository badcaseRepository;
    private final RagPipelineTraceRepository traceRepository;
    private final RagMessageRepository messageRepository;
    private final DevContextProperties devContext;
    private final ObjectMapper objectMapper;

    @Transactional
    public FeedbackResponse submit(FeedbackRequest request) {
        String traceId = request.getTraceId();
        String uid = devContext.getUserId();

        // Look up context from pipeline trace
        Optional<RagPipelineTrace> traceOpt = traceRepository.findByTraceId(traceId);
        String tenantId = traceOpt.map(RagPipelineTrace::getTenantId).orElse("default");
        String sessionId = traceOpt.map(RagPipelineTrace::getSessionId).orElse(null);

        // Find the assistant message for this trace
        List<RagMessage> messages = messageRepository.findByTraceIdOrderByCreatedAtAsc(traceId);
        RagMessage assistantMsg = messages.stream()
                .filter(m -> "assistant".equals(m.getRole()))
                .findFirst()
                .orElse(null);
        Long messageId = assistantMsg != null ? assistantMsg.getId() : null;

        // Effectively final copies for lambda
        final String finalTenantId = tenantId;
        final String finalUid = uid;
        final String finalSessionId = sessionId;
        final Long finalMessageId = messageId;

        // Upsert feedback (one per trace)
        RagFeedback feedback = feedbackRepository.findByTraceId(traceId)
                .orElseGet(() -> RagFeedback.builder()
                        .traceId(traceId)
                        .tenantId(finalTenantId)
                        .uid(finalUid)
                        .sessionId(finalSessionId)
                        .messageId(finalMessageId)
                        .build());

        feedback.setFeedbackType(request.getFeedbackType());
        feedback.setReportReason(request.getReportReason());
        feedback.setComment(request.getComment());

        RagFeedback saved = feedbackRepository.save(feedback);

        // Auto-archive badcase for DISLIKE/REPORT
        if ("DISLIKE".equals(request.getFeedbackType()) || "REPORT".equals(request.getFeedbackType())) {
            archiveBadcase(saved, traceOpt.orElse(null), assistantMsg);
        }

        log.info("Feedback saved traceId={} type={} reason={}",
                traceId, request.getFeedbackType(), request.getReportReason());

        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public Optional<FeedbackResponse> findByTraceId(String traceId) {
        return feedbackRepository.findByTraceId(traceId).map(this::toResponse);
    }

    private void archiveBadcase(RagFeedback feedback, RagPipelineTrace trace, RagMessage assistantMsg) {
        try {
            String queryText = "";
            String rewrittenQuery = null;
            String traceSummaryJson = null;

            if (trace != null) {
                queryText = trace.getQueryText() != null ? trace.getQueryText() : "";
                rewrittenQuery = trace.getRewrittenQuery();
                traceSummaryJson = buildTraceSummary(trace);
            }

            String answer = "";
            String citationsJson = null;
            if (assistantMsg != null) {
                answer = assistantMsg.getContent() != null ? assistantMsg.getContent() : "";
                citationsJson = assistantMsg.getCitations();
            }

            BadcaseArchive badcase = BadcaseArchive.builder()
                    .feedbackId(feedback.getId())
                    .traceId(feedback.getTraceId())
                    .tenantId(feedback.getTenantId())
                    .sessionId(feedback.getSessionId())
                    .queryText(queryText)
                    .rewrittenQuery(rewrittenQuery)
                    .answer(answer)
                    .citations(citationsJson)
                    .feedbackType(feedback.getFeedbackType())
                    .reportReason(feedback.getReportReason())
                    .comment(feedback.getComment())
                    .traceSummary(traceSummaryJson)
                    .status("OPEN")
                    .build();

            badcaseRepository.save(badcase);
            log.info("Badcase archived traceId={} feedbackId={}", feedback.getTraceId(), feedback.getId());
        } catch (Exception e) {
            log.warn("Failed to archive badcase for traceId={}: {}", feedback.getTraceId(), e.getMessage());
        }
    }

    private String buildTraceSummary(RagPipelineTrace trace) {
        try {
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("totalMs", trace.getTotalMs());
            summary.put("recallCount", trace.getRecallCount());
            summary.put("aclFilteredCount", trace.getAclFilteredCount());
            summary.put("rerankCount", trace.getRerankCount());
            summary.put("citationsCount", trace.getCitationsCount());
            summary.put("result", trace.getResult());
            summary.put("refusalReason", trace.getRefusalReason());
            summary.put("cacheHit", trace.isCacheHit());
            return objectMapper.writeValueAsString(summary);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private FeedbackResponse toResponse(RagFeedback entity) {
        return FeedbackResponse.builder()
                .id(entity.getId())
                .traceId(entity.getTraceId())
                .tenantId(entity.getTenantId())
                .uid(entity.getUid())
                .sessionId(entity.getSessionId())
                .messageId(entity.getMessageId())
                .feedbackType(entity.getFeedbackType())
                .reportReason(entity.getReportReason())
                .comment(entity.getComment())
                .confidence(entity.getConfidence())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}

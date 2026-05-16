package com.kb.rag.controller;

import com.kb.rag.dto.RagPipelineTraceSummary;
import com.kb.rag.entity.RagFeedback;
import com.kb.rag.repository.BadcaseArchiveRepository;
import com.kb.rag.repository.DocAuditLogRepository;
import com.kb.rag.repository.RagFeedbackRepository;
import com.kb.rag.repository.RagPipelineTraceRepository;
import com.kb.rag.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ChatControllerTest {

    private RagPipelineTraceRepository traceRepo;
    private RagFeedbackRepository feedbackRepo;
    private ChatController controller;

    @BeforeEach
    void setUp() {
        traceRepo = mock(RagPipelineTraceRepository.class);
        feedbackRepo = mock(RagFeedbackRepository.class);
        controller = new ChatController(
                mock(ChatService.class),
                mock(SessionService.class),
                mock(PipelineTraceService.class),
                mock(FeedbackService.class),
                mock(AnalyticsService.class),
                mock(FaqStore.class),
                mock(BadcaseService.class),
                mock(AlertService.class),
                mock(DocAuditLogRepository.class),
                mock(BadcaseArchiveRepository.class),
                feedbackRepo,
                traceRepo);
    }

    @Test
    void listTracesReturnsPaginatedResults() {
        var summary = new RagPipelineTraceSummary(
                "tr-test-001", "dev-tenant-001", "user-1", "sess-1",
                "测试查询", null, "space-1", "zh",
                false, false, "SUCCESS", null,
                150L, 80L, 10, 2, 5, 3, null,
                Instant.parse("2026-05-14T10:00:00Z"));
        Page<RagPipelineTraceSummary> page = new PageImpl<>(List.of(summary), PageRequest.of(0, 20), 1);
        when(traceRepo.findTraceSummaries(eq("dev-tenant-001"), isNull(), any(Instant.class), any(Instant.class), any()))
                .thenReturn(page);

        ResponseEntity<Map<String, Object>> resp = controller.listTraces(
                "dev-tenant-001", null, null, null, 0, 20);

        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        Map<String, Object> body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("total")).isEqualTo(1L);
        assertThat(body.get("page")).isEqualTo(0);
        assertThat(body.get("size")).isEqualTo(20);
        assertThat(((List<?>) body.get("items"))).hasSize(1);

        verify(traceRepo).findTraceSummaries(eq("dev-tenant-001"), isNull(), any(Instant.class), any(Instant.class), any());
    }

    @Test
    void listTracesWithFilters() {
        when(traceRepo.findTraceSummaries(eq("dev-tenant-001"), eq("ERROR"), any(Instant.class), any(Instant.class), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 10), 0));

        ResponseEntity<Map<String, Object>> resp = controller.listTraces(
                "dev-tenant-001", "ERROR",
                "2026-05-01T00:00:00Z", "2026-05-14T23:59:59Z",
                0, 10);

        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        Map<String, Object> body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("total")).isEqualTo(0L);

        verify(traceRepo).findTraceSummaries(eq("dev-tenant-001"), eq("ERROR"),
                eq(Instant.parse("2026-05-01T00:00:00Z")),
                eq(Instant.parse("2026-05-14T23:59:59Z")), any());
    }

    @Test
    void listTracesReturnsEmptyList() {
        when(traceRepo.findTraceSummaries(anyString(), isNull(), any(Instant.class), any(Instant.class), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        ResponseEntity<Map<String, Object>> resp = controller.listTraces(
                "dev-tenant-001", null, null, null, 0, 20);

        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        Map<String, Object> body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(((List<?>) body.get("items"))).isEmpty();
        assertThat(body.get("total")).isEqualTo(0L);
    }

    @Test
    void listFeedbackReturnsPaginatedResults() {
        RagFeedback fb = new RagFeedback();
        fb.setId(1L);
        fb.setTraceId("tr-fb-001");
        fb.setTenantId("dev-tenant-001");
        fb.setUid("user-1");
        fb.setFeedbackType("DISLIKE");
        fb.setReportReason("HALLUCINATION");
        fb.setComment("答案不正确");
        fb.setCreatedAt(Instant.parse("2026-05-14T10:00:00Z"));
        fb.setUpdatedAt(Instant.parse("2026-05-14T10:00:00Z"));
        Page<RagFeedback> page = new PageImpl<>(List.of(fb), PageRequest.of(0, 20), 1);
        when(feedbackRepo.findFeedback(eq("dev-tenant-001"), isNull(), any(Instant.class), any(Instant.class), any()))
                .thenReturn(page);

        ResponseEntity<Map<String, Object>> resp = controller.listFeedback(
                "dev-tenant-001", null, null, null, 0, 20);

        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        Map<String, Object> body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("total")).isEqualTo(1L);
        assertThat(((List<?>) body.get("items"))).hasSize(1);

        verify(feedbackRepo).findFeedback(eq("dev-tenant-001"), isNull(), any(Instant.class), any(Instant.class), any());
    }

    @Test
    void listFeedbackWithTypeFilter() {
        when(feedbackRepo.findFeedback(eq("dev-tenant-001"), eq("REPORT"), any(Instant.class), any(Instant.class), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 10), 0));

        ResponseEntity<Map<String, Object>> resp = controller.listFeedback(
                "dev-tenant-001", "REPORT", null, null, 0, 10);

        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        verify(feedbackRepo).findFeedback(eq("dev-tenant-001"), eq("REPORT"), any(Instant.class), any(Instant.class), any());
    }
}

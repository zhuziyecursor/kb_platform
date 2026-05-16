package com.kb.rag.service;

import com.kb.rag.repository.RagPipelineTraceRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Verifies PipelineTraceService sets MDC span during stage execution.
 */
class PipelineTraceServiceMdcTest {

    private PipelineTraceService service;
    private PipelineTraceService.TraceContext trace;

    @BeforeEach
    void setUp() {
        RagPipelineTraceRepository repo = mock(RagPipelineTraceRepository.class);
        service = new PipelineTraceService(repo, new com.fasterxml.jackson.databind.ObjectMapper(), Optional.empty());
        trace = service.start("tr-test", "t-1", "u-1", "s-1", "test query", null, "zh", false);
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    void stage_shouldSetMdcSpan() {
        trace.stage("bm25_search", () -> {
            assertThat(MDC.get("span")).isEqualTo("bm25_search");
            return 42;
        });
    }

    @Test
    void stage_shouldSetMdcSpan_onFailure() {
        try {
            trace.stage("milvus_upsert", () -> {
                assertThat(MDC.get("span")).isEqualTo("milvus_upsert");
                throw new RuntimeException("simulated failure");
            });
        } catch (RuntimeException ignored) {
        }
        assertThat(MDC.get("span")).isEqualTo("milvus_upsert");
    }

    @Test
    void stage_shouldPropagateReturnValue() {
        String result = trace.stage("test", () -> "hello");
        assertThat(result).isEqualTo("hello");
    }

    @Test
    void stage_shouldPropagateException() {
        RuntimeException ex = new RuntimeException("boom");
        try {
            trace.stage("test", () -> { throw ex; });
        } catch (RuntimeException caught) {
            assertThat(caught).isSameAs(ex);
        }
    }

    @Test
    void consecutiveStages_shouldOverwriteSpan() {
        trace.stage("step1", () -> "a");
        assertThat(MDC.get("span")).isEqualTo("step1");

        trace.stage("step2", () -> "b");
        assertThat(MDC.get("span")).isEqualTo("step2");
    }

    @Test
    void finish_shouldNotThrow() {
        trace.stage("step1", () -> "done");
        service.finish(trace);
    }
}

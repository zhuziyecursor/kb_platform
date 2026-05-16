package com.kb.rag.service;

import com.kb.rag.dto.CitationDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RefusalServiceTest {

    private RefusalService service;

    @BeforeEach
    void setUp() {
        service = new RefusalService();
        ReflectionTestUtils.setField(service, "confidenceThreshold", 0.5);
        ReflectionTestUtils.setField(service, "rerankFallbackBump", 0.2);
    }

    @Test
    void noMilvusResults_refused() {
        var refusal = service.check(List.of(citation(0.9)), false);
        assertThat(refusal.refused()).isTrue();
        assertThat(refusal.reason()).isEqualTo("NO_MATCH");
    }

    @Test
    void emptyCitations_refused() {
        var refusal = service.check(List.of(), true);
        assertThat(refusal.refused()).isTrue();
        assertThat(refusal.reason()).isEqualTo("NO_MATCH");
    }

    @Test
    void aboveThreshold_passes() {
        var refusal = service.check(List.of(citation(0.7)), true);
        assertThat(refusal.refused()).isFalse();
    }

    @Test
    void belowThreshold_refusedWithLowConfidence() {
        var refusal = service.check(List.of(citation(0.3)), true);
        assertThat(refusal.refused()).isTrue();
        assertThat(refusal.reason()).isEqualTo("LOW_CONFIDENCE");
    }

    @Test
    void rerankFallback_bumpsThreshold() {
        // Score 0.6 passes the base 0.5 threshold, but fails when rerank fallback adds 0.2 (→0.7).
        var passNormal = service.check(List.of(citation(0.6)), true, false);
        var failBumped = service.check(List.of(citation(0.6)), true, true);

        assertThat(passNormal.refused()).isFalse();
        assertThat(failBumped.refused()).isTrue();
        assertThat(failBumped.reason()).isEqualTo("LOW_CONFIDENCE");
    }

    @Test
    void denseUnavailable_hasDistinctReason() {
        var refusal = service.denseUnavailable();
        assertThat(refusal.reason()).isEqualTo("DENSE_UNAVAILABLE");
    }

    private static CitationDto citation(double score) {
        CitationDto c = new CitationDto();
        c.setScore(score);
        return c;
    }
}

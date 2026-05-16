package com.kb.rag.dto;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RagPipelineTraceSummaryTest {

    @Test
    void constructorAndGettersMapAllFields() {
        Instant now = Instant.parse("2026-05-14T10:00:00Z");
        var s = new RagPipelineTraceSummary(
                "tr-001", "tenant-1", "user-1", "session-1",
                "查询内容", "改写后查询", "space-1", "zh",
                true, true,
                "SUCCESS", "NO_MATCH",
                350L, 120L,
                20, 5, 10, 8,
                "error msg",
                now);

        assertThat(s.getTraceId()).isEqualTo("tr-001");
        assertThat(s.getTenantId()).isEqualTo("tenant-1");
        assertThat(s.getUid()).isEqualTo("user-1");
        assertThat(s.getSessionId()).isEqualTo("session-1");
        assertThat(s.getQueryText()).isEqualTo("查询内容");
        assertThat(s.getRewrittenQuery()).isEqualTo("改写后查询");
        assertThat(s.getSpaceId()).isEqualTo("space-1");
        assertThat(s.getLang()).isEqualTo("zh");
        assertThat(s.isCacheHit()).isTrue();
        assertThat(s.isStream()).isTrue();
        assertThat(s.getResult()).isEqualTo("SUCCESS");
        assertThat(s.getRefusalReason()).isEqualTo("NO_MATCH");
        assertThat(s.getTotalMs()).isEqualTo(350L);
        assertThat(s.getFirstTokenMs()).isEqualTo(120L);
        assertThat(s.getRecallCount()).isEqualTo(20);
        assertThat(s.getAclFilteredCount()).isEqualTo(5);
        assertThat(s.getRerankCount()).isEqualTo(10);
        assertThat(s.getCitationsCount()).isEqualTo(8);
        assertThat(s.getErrorMessage()).isEqualTo("error msg");
        assertThat(s.getCreatedAt()).isEqualTo(now);
    }

    @Test
    void nullableFieldsCanBeNull() {
        var s = new RagPipelineTraceSummary(
                "tr-002", "tenant-1", "user-1", null,
                null, null, null, "zh",
                false, false,
                "UNKNOWN", null,
                0L, null,
                0, 0, 0, 0,
                null,
                Instant.now());

        assertThat(s.getSessionId()).isNull();
        assertThat(s.getQueryText()).isNull();
        assertThat(s.getRewrittenQuery()).isNull();
        assertThat(s.getSpaceId()).isNull();
        assertThat(s.getRefusalReason()).isNull();
        assertThat(s.getFirstTokenMs()).isNull();
        assertThat(s.getErrorMessage()).isNull();
    }
}

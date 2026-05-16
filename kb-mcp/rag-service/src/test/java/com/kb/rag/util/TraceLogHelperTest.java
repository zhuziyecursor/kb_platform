package com.kb.rag.util;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class TraceLogHelperTest {

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    void setTraceId_shouldPutValueInMdc() {
        TraceLogHelper.setTraceId("tr-test-123");
        assertThat(MDC.get("trace_id")).isEqualTo("tr-test-123");
    }

    @Test
    void setTraceId_shouldNotThrowOnNull() {
        assertThatCode(() -> TraceLogHelper.setTraceId(null))
                .doesNotThrowAnyException();
        assertThat(MDC.get("trace_id")).isNull();
    }

    @Test
    void setTraceId_shouldNotThrowOnBlank() {
        assertThatCode(() -> TraceLogHelper.setTraceId("   "))
                .doesNotThrowAnyException();
        assertThat(MDC.get("trace_id")).isNull();
    }

    @Test
    void setSpan_shouldPutValueInMdc() {
        TraceLogHelper.setSpan("bm25_search");
        assertThat(MDC.get("span")).isEqualTo("bm25_search");
    }

    @Test
    void setSpan_shouldNotThrowOnNull() {
        assertThatCode(() -> TraceLogHelper.setSpan(null))
                .doesNotThrowAnyException();
    }

    @Test
    void setEventType_shouldPutValueInMdc() {
        TraceLogHelper.setEventType("trace");
        assertThat(MDC.get("event_type")).isEqualTo("trace");
    }

    @Test
    void setEventType_shouldNotThrowOnNull() {
        assertThatCode(() -> TraceLogHelper.setEventType(null))
                .doesNotThrowAnyException();
    }

    @Test
    void put_shouldStoreArbitraryKeyValue() {
        TraceLogHelper.put("duration_ms", "245");
        assertThat(MDC.get("duration_ms")).isEqualTo("245");
    }

    @Test
    void put_shouldNotThrowOnNullKeyOrValue() {
        assertThatCode(() -> TraceLogHelper.put(null, "val")).doesNotThrowAnyException();
        assertThatCode(() -> TraceLogHelper.put("key", null)).doesNotThrowAnyException();
        assertThatCode(() -> TraceLogHelper.put(null, null)).doesNotThrowAnyException();
    }

    @Test
    void clear_shouldRemoveAllMdcValues() {
        TraceLogHelper.setTraceId("tr-123");
        TraceLogHelper.setSpan("test");
        TraceLogHelper.setEventType("app");

        TraceLogHelper.clear();

        assertThat(MDC.get("trace_id")).isNull();
        assertThat(MDC.get("span")).isNull();
        assertThat(MDC.get("event_type")).isNull();
    }

    @Test
    void clear_shouldNotThrowWhenMdcIsEmpty() {
        assertThatCode(TraceLogHelper::clear).doesNotThrowAnyException();
    }

    @Test
    void consecutiveCalls_shouldOverwriteValues() {
        TraceLogHelper.setTraceId("tr-first");
        TraceLogHelper.setTraceId("tr-second");
        assertThat(MDC.get("trace_id")).isEqualTo("tr-second");
    }
}

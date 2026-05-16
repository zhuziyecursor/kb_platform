package com.kb.llm.util;

import org.slf4j.MDC;

public final class TraceLogHelper {

    private TraceLogHelper() {}

    public static void setTraceId(String traceId) {
        try {
            if (traceId != null && !traceId.isBlank()) {
                MDC.put("trace_id", traceId);
            }
        } catch (Exception ignored) {
        }
    }

    public static void setSpan(String span) {
        try {
            if (span != null && !span.isBlank()) {
                MDC.put("span", span);
            }
        } catch (Exception ignored) {
        }
    }

    public static void setEventType(String eventType) {
        try {
            if (eventType != null && !eventType.isBlank()) {
                MDC.put("event_type", eventType);
            }
        } catch (Exception ignored) {
        }
    }

    public static void put(String key, String value) {
        try {
            if (key != null && value != null) {
                MDC.put(key, value);
            }
        } catch (Exception ignored) {
        }
    }

    public static void clear() {
        try {
            MDC.clear();
        } catch (Exception ignored) {
        }
    }
}

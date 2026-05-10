package com.kb.rag.dto;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Data
@Builder
public class RagPipelineTraceResponse {
    private String traceId;
    private String tenantId;
    private String uid;
    private String sessionId;
    private String queryText;
    private String rewrittenQuery;
    private String spaceId;
    private String lang;
    private boolean cacheHit;
    private boolean stream;
    private String result;
    private String refusalReason;
    private long totalMs;
    private Long firstTokenMs;
    private List<Map<String, Object>> stageTimings;
    private int recallCount;
    private int aclFilteredCount;
    private int rerankCount;
    private int citationsCount;
    private List<Map<String, Object>> hitDocs;
    private Map<String, Object> promptBudget;
    private String errorMessage;
    private Instant createdAt;
}

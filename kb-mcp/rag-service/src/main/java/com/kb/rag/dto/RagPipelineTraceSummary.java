package com.kb.rag.dto;

import java.time.Instant;

/**
 * Lightweight DTO for pipeline trace list view — excludes large JSONB columns
 * (stageTimings, hitDocs, promptBudget) that are only needed in detail view.
 * Uses a regular class (not a record) for JPQL constructor expression compatibility.
 */
public class RagPipelineTraceSummary {

    private final String traceId;
    private final String tenantId;
    private final String uid;
    private final String sessionId;
    private final String queryText;
    private final String rewrittenQuery;
    private final String spaceId;
    private final String lang;
    private final boolean cacheHit;
    private final boolean stream;
    private final String result;
    private final String refusalReason;
    private final long totalMs;
    private final Long firstTokenMs;
    private final int recallCount;
    private final int aclFilteredCount;
    private final int rerankCount;
    private final int citationsCount;
    private final String errorMessage;
    private final Instant createdAt;

    public RagPipelineTraceSummary(
            String traceId, String tenantId, String uid, String sessionId,
            String queryText, String rewrittenQuery, String spaceId, String lang,
            boolean cacheHit, boolean stream, String result, String refusalReason,
            long totalMs, Long firstTokenMs, int recallCount, int aclFilteredCount,
            int rerankCount, int citationsCount, String errorMessage, Instant createdAt) {
        this.traceId = traceId;
        this.tenantId = tenantId;
        this.uid = uid;
        this.sessionId = sessionId;
        this.queryText = queryText;
        this.rewrittenQuery = rewrittenQuery;
        this.spaceId = spaceId;
        this.lang = lang;
        this.cacheHit = cacheHit;
        this.stream = stream;
        this.result = result;
        this.refusalReason = refusalReason;
        this.totalMs = totalMs;
        this.firstTokenMs = firstTokenMs;
        this.recallCount = recallCount;
        this.aclFilteredCount = aclFilteredCount;
        this.rerankCount = rerankCount;
        this.citationsCount = citationsCount;
        this.errorMessage = errorMessage;
        this.createdAt = createdAt;
    }

    public String getTraceId() { return traceId; }
    public String getTenantId() { return tenantId; }
    public String getUid() { return uid; }
    public String getSessionId() { return sessionId; }
    public String getQueryText() { return queryText; }
    public String getRewrittenQuery() { return rewrittenQuery; }
    public String getSpaceId() { return spaceId; }
    public String getLang() { return lang; }
    public boolean isCacheHit() { return cacheHit; }
    public boolean isStream() { return stream; }
    public String getResult() { return result; }
    public String getRefusalReason() { return refusalReason; }
    public long getTotalMs() { return totalMs; }
    public Long getFirstTokenMs() { return firstTokenMs; }
    public int getRecallCount() { return recallCount; }
    public int getAclFilteredCount() { return aclFilteredCount; }
    public int getRerankCount() { return rerankCount; }
    public int getCitationsCount() { return citationsCount; }
    public String getErrorMessage() { return errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
}

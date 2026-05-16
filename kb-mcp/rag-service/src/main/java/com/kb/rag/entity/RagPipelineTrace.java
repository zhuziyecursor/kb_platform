package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "rag_pipeline_trace", schema = "kb_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RagPipelineTrace {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trace_id", length = 128, nullable = false, unique = true)
    private String traceId;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "uid", length = 64, nullable = false)
    private String uid;

    @Column(name = "session_id", length = 128)
    private String sessionId;

    @Column(name = "query_text", columnDefinition = "TEXT")
    private String queryText;

    @Column(name = "rewritten_query", columnDefinition = "TEXT")
    private String rewrittenQuery;

    @Column(name = "space_id", length = 128)
    private String spaceId;

    @Column(name = "lang", length = 16, nullable = false)
    private String lang;

    @Column(name = "cache_hit", nullable = false)
    private boolean cacheHit;

    @Column(name = "stream", nullable = false)
    private boolean stream;

    @Column(name = "result", length = 32, nullable = false)
    private String result;

    @Column(name = "refusal_reason", length = 64)
    private String refusalReason;

    @Column(name = "total_ms", nullable = false)
    private long totalMs;

    @Column(name = "first_token_ms")
    private Long firstTokenMs;

    @Column(name = "stage_timings", nullable = false, columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String stageTimings;

    @Column(name = "recall_count", nullable = false)
    private int recallCount;

    @Column(name = "acl_filtered_count", nullable = false)
    private int aclFilteredCount;

    @Column(name = "rerank_count", nullable = false)
    private int rerankCount;

    @Column(name = "citations_count", nullable = false)
    private int citationsCount;

    @Column(name = "hit_docs", nullable = false, columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String hitDocs;

    @Column(name = "prompt_budget", nullable = false, columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String promptBudget;

    @Column(name = "channel_hits", nullable = false, columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String channelHits;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (lang == null) lang = "zh";
        if (result == null) result = "UNKNOWN";
        if (stageTimings == null) stageTimings = "[]";
        if (hitDocs == null) hitDocs = "[]";
        if (promptBudget == null) promptBudget = "{}";
        if (channelHits == null) channelHits = "{}";
    }
}

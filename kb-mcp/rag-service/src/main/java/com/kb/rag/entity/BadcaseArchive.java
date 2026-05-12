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
@Table(name = "badcase_archive", schema = "kb_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BadcaseArchive {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "feedback_id", nullable = false)
    private Long feedbackId;

    @Column(name = "trace_id", length = 128, nullable = false)
    private String traceId;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "session_id", length = 128)
    private String sessionId;

    @Column(name = "query_text", columnDefinition = "TEXT", nullable = false)
    private String queryText;

    @Column(name = "rewritten_query", columnDefinition = "TEXT")
    private String rewrittenQuery;

    @Column(name = "answer", columnDefinition = "TEXT", nullable = false)
    private String answer;

    @Column(name = "citations", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String citations;

    @Column(name = "feedback_type", length = 16, nullable = false)
    private String feedbackType;

    @Column(name = "report_reason", length = 32)
    private String reportReason;

    @Column(name = "comment", columnDefinition = "TEXT")
    private String comment;

    @Column(name = "trace_summary", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String traceSummary;

    @Column(name = "status", length = 16, nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
        if (status == null) status = "OPEN";
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}

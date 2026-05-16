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
@Table(name = "eval_run", schema = "kb_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_id", length = 64, nullable = false, unique = true)
    private String runId;

    @Column(name = "dataset_id", length = 64, nullable = false)
    private String datasetId;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

    @Column(name = "config", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String config;

    @Column(name = "metrics", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String metrics;

    @Column(name = "progress", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String progress;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (status == null) status = "PENDING";
        if (tenantId == null) tenantId = "default";
        if (config == null) config = "{}";
        if (metrics == null) metrics = "{}";
        if (progress == null) progress = "{}";
    }
}

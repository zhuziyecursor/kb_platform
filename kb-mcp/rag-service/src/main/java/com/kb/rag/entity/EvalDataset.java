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
@Table(name = "eval_dataset", schema = "kb_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalDataset {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "dataset_id", length = 64, nullable = false, unique = true)
    private String datasetId;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "name", length = 256, nullable = false)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "source_type", length = 32, nullable = false)
    private String sourceType;

    @Column(name = "source_path", columnDefinition = "TEXT")
    private String sourcePath;

    @Column(name = "file_count", nullable = false)
    private int fileCount;

    @Column(name = "total_chunks", nullable = false)
    private int totalChunks;

    @Column(name = "total_qa_pairs", nullable = false)
    private int totalQaPairs;

    @Column(name = "qa_config", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String qaConfig;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

    @Column(name = "progress", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String progress;

    @Column(name = "trace_id", length = 128)
    private String traceId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
        if (status == null) status = "DRAFT";
        if (tenantId == null) tenantId = "default";
        if (qaConfig == null) qaConfig = "{}";
        if (progress == null) progress = "{}";
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}

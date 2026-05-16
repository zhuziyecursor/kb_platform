package com.kb.vector.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "reconcile_log", schema = "kb_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReconcileLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "run_at", nullable = false)
    private Instant runAt;

    @Column(name = "pg_count")
    private Long pgCount;

    @Column(name = "milvus_count")
    private Long milvusCount;

    @Column(name = "missing_in_milvus")
    private Long missingInMilvus;

    @Column(name = "missing_in_pg")
    private Long missingInPg;

    @Column(name = "repaired_to_milvus")
    private Long repairedToMilvus;

    @Column(name = "repaired_to_pg")
    private Long repairedToPg;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
}

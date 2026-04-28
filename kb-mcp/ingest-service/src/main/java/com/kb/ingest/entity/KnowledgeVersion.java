package com.kb.ingest.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "knowledge_version",
       schema = "kb_knowledge",
       uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "doc_id", "version"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "doc_id", length = 128, nullable = false)
    private String docId;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "status", length = 16, nullable = false)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "created_by", length = 64, nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "knowledge_structured", schema = "kb_knowledge")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeStructured {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "doc_id", nullable = false)
    private String docId;

    @Column(nullable = false)
    private int version;

    @Column(name = "json_body", nullable = false, columnDefinition = "JSONB")
    private String jsonBody;

    @Column(name = "extractor_ver", nullable = false)
    private String extractorVer;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}

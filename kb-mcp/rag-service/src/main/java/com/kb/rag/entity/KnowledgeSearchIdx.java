package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "knowledge_search_idx", schema = "kb_knowledge")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeSearchIdx {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "doc_id", nullable = false)
    private String docId;

    @Column(nullable = false)
    private int version;

    @Column(name = "chunk_seq", nullable = false)
    private int chunkSeq;

    @Column
    private String title;

    @Column(name = "text_snippet", nullable = false, columnDefinition = "TEXT")
    private String textSnippet;

    @Column(name = "tokens", nullable = false, columnDefinition = "TSVECTOR")
    private String tokens;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}

package com.kb.vector.entity;

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

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "doc_id", nullable = false, length = 128)
    private String docId;

    @Column(nullable = false)
    private int version;

    @Column(name = "chunk_seq", nullable = false)
    private int chunkSeq;

    @Column(length = 256)
    private String title;

    @Column(name = "text_snippet", nullable = false, columnDefinition = "TEXT")
    private String textSnippet;

    @Column(name = "tokens", nullable = false, columnDefinition = "TSVECTOR")
    private String tokens;

    @Column(name = "sec_level", nullable = false)
    private int secLevel;

    @Column(name = "perm_group_id", nullable = false)
    private long permGroupId;

    @Column(name = "effective_to")
    private String effectiveTo;

    @Column(name = "region_code", nullable = false, length = 32)
    private String regionCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}

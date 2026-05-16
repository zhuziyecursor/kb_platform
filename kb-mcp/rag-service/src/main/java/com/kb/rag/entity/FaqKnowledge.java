package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "faq_knowledge", schema = "kb_knowledge")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FaqKnowledge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String question;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;

    @Column(name = "embedding_json", columnDefinition = "TEXT")
    private String embeddingJson;

    @Column(name = "space_id")
    private String spaceId;

    @Column(name = "hit_count", nullable = false)
    private long hitCount;

    @Column(name = "sec_level", nullable = false)
    private int secLevel = 1;

    @Column(name = "perm_group_id", nullable = false)
    private long permGroupId;

    @Column(name = "effective_to", columnDefinition = "DATE")
    private String effectiveTo;

    @Column(name = "region_code", nullable = false, length = 32)
    private String regionCode = "CN-NATIONAL";

    @Column(name = "embedding_model", nullable = false, length = 64)
    private String embeddingModel = "BGE-zh-v1.5";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}

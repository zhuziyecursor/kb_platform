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
@Table(name = "eval_qa_pair", schema = "kb_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalQaPair {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pair_id", length = 64, nullable = false, unique = true)
    private String pairId;

    @Column(name = "dataset_id", length = 64, nullable = false)
    private String datasetId;

    @Column(name = "question", columnDefinition = "TEXT", nullable = false)
    private String question;

    @Column(name = "answer", columnDefinition = "TEXT", nullable = false)
    private String answer;

    @Column(name = "qa_type", length = 32, nullable = false)
    private String qaType;

    @Column(name = "source_chunk_ids", columnDefinition = "TEXT[]")
    @JdbcTypeCode(SqlTypes.ARRAY)
    private String[] sourceChunkIds;

    @Column(name = "source_doc_path", columnDefinition = "TEXT")
    private String sourceDocPath;

    @Column(name = "difficulty", length = 16)
    private String difficulty;

    @Column(name = "tags", columnDefinition = "TEXT[]")
    @JdbcTypeCode(SqlTypes.ARRAY)
    private String[] tags;

    @Column(name = "metadata", columnDefinition = "JSONB")
    @JdbcTypeCode(SqlTypes.JSON)
    private String metadata;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (difficulty == null) difficulty = "MEDIUM";
        if (sourceChunkIds == null) sourceChunkIds = new String[0];
        if (tags == null) tags = new String[0];
        if (metadata == null) metadata = "{}";
    }
}

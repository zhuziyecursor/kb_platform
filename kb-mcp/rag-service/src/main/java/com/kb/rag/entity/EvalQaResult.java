package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "eval_qa_result", schema = "kb_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalQaResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_id", length = 64, nullable = false)
    private String runId;

    @Column(name = "pair_id", length = 64, nullable = false)
    private String pairId;

    @Column(name = "rag_answer", columnDefinition = "TEXT")
    private String ragAnswer;

    @Column(name = "rag_trace_id", length = 128)
    private String ragTraceId;

    @Column(name = "exact_match")
    private Boolean exactMatch;

    @Column(name = "f1_score")
    private Double f1Score;

    @Column(name = "recall")
    private Double recall;

    @Column(name = "llm_judge_score")
    private Double llmJudgeScore;

    @Column(name = "llm_judge_reason", columnDefinition = "TEXT")
    private String llmJudgeReason;

    @Column(name = "citations_count")
    private Integer citationsCount;

    @Column(name = "latency_ms")
    private Long latencyMs;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }
}

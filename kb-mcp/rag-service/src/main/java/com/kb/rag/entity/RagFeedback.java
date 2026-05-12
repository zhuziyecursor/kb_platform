package com.kb.rag.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "rag_feedback", schema = "kb_audit")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RagFeedback {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trace_id", length = 128, nullable = false, unique = true)
    private String traceId;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "uid", length = 64, nullable = false)
    private String uid;

    @Column(name = "session_id", length = 128)
    private String sessionId;

    @Column(name = "message_id")
    private Long messageId;

    @Column(name = "feedback_type", length = 16, nullable = false)
    private String feedbackType;

    @Column(name = "report_reason", length = 32)
    private String reportReason;

    @Column(name = "comment", columnDefinition = "TEXT")
    private String comment;

    @Column(name = "confidence", length = 8)
    private String confidence;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}

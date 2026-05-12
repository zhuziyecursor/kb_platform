package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FeedbackResponse {

    private Long id;
    private String traceId;
    private String tenantId;
    private String uid;
    private String sessionId;
    private Long messageId;
    private String feedbackType;
    private String reportReason;
    private String comment;
    private String confidence;
    private Instant createdAt;
    private Instant updatedAt;
}

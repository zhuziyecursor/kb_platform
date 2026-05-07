package com.kb.llm.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogEntry {
    private String traceId;
    private String tenantId;
    private String model;
    private String provider;
    private int promptTokens;
    private int completionTokens;
    private long latencyMs;
    private String status;
    private String errorCode;
}

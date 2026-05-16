package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalRunResponse {

    private String runId;
    private String datasetId;
    private String tenantId;
    private String status;
    private Map<String, Object> config;
    private Map<String, Object> metrics;
    private Map<String, Object> progress;
    private Instant startedAt;
    private Instant completedAt;
    private Instant createdAt;
}

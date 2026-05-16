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
public class DatasetResponse {

    private String datasetId;
    private String tenantId;
    private String name;
    private String description;
    private String sourceType;
    private String sourcePath;
    private int fileCount;
    private int totalChunks;
    private int totalQaPairs;
    private Map<String, Object> qaConfig;
    private String status;
    private Map<String, Object> progress;
    private String traceId;
    private Instant createdAt;
    private Instant updatedAt;
}

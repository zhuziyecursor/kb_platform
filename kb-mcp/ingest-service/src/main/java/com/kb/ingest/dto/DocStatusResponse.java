package com.kb.ingest.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocStatusResponse {
    private String docId;
    private Integer version;
    private String status;
    @Builder.Default
    private Integer retryCount = 0;
    private String lastError;
    private String traceId;
}
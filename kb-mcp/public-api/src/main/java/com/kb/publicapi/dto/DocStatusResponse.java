package com.kb.publicapi.dto;

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
    private Integer retryCount;
    private String lastError;
    private String traceId;
}

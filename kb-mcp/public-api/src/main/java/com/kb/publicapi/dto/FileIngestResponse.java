package com.kb.publicapi.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileIngestResponse {
    private String docId;
    private Integer version;
    private String jobId;
    private String status;
    private String message;
    private String traceId;
    private String statusUrl;
}

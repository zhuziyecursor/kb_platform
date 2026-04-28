package com.kb.ingest.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VerifyUploadResponse {
    private String docId;
    @Builder.Default
    private Boolean verified = true;
    private String traceId;
}
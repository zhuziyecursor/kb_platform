package com.kb.ingest.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InitUploadResponse {
    private String docId;
    private String presignedUrl;
    @Builder.Default
    private Integer expireIn = 300;
}
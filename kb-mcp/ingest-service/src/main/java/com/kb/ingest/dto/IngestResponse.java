package com.kb.ingest.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IngestResponse {
    private String docId;
    private Integer version;
    private String status;
    @Builder.Default
    private String message = "入库任务已提交";
    private String traceId;
}
package com.kb.ingest.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocListResponse {
    private List<DocSummary> docs;
    private int total;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DocSummary {
        private String docId;
        private String title;
        private Integer version;
        private String docType;
        private String status;
        private Integer secLevel;
        private String bizDomain;
        private String regionCode;
        private String ownerUid;
        private String deptId;
        private String effectiveFrom;
        private String effectiveTo;
        private String labelTags;
        private String srcPath;
        private String createTime;
        private Long fileSize;
        private String knowledgeSpaceId;
    }
}
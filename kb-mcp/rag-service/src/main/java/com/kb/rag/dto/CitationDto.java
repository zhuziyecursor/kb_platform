package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CitationDto {
    private String docId;
    private int chunkSeq;
    private String title;
    private int version;
    private int page;
    private String sectionPath;
    private String regionCode;
    private String effectiveFrom;
    private String effectiveTo;
    private boolean isCurrent;
    private double score;
    private String text;
    private String parentText;  // Parent chunk 完整文本（用于生成上下文）
    private String parentRef;     // Parent-Children 关联：格式 "docId/version/parentSeq"
    private String knowledgeSpaceId;
    private String spacePath;
}

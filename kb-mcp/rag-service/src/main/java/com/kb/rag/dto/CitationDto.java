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
}

package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MilvusSearchResult {
    private long id;
    private String docId;
    private int chunkSeq;
    private int version;
    private String text;
    private String title;
    private String sectionPath;
    private int page;
    private int secLevel;
    private String regionCode;
    private String bizDomain;
    private long permGroupId;
    private String effectiveFrom;
    private String effectiveTo;
    private String tags;
    private String chunkType;
    private double vectorScore;
}

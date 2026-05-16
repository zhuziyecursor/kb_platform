package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Bm25SearchResult {
    private String docId;
    private int version;
    private int chunkSeq;
    private String title;
    private String textSnippet;
    private double bm25Score;
    private int secLevel;
    private long permGroupId;
    private String effectiveTo;
    private String regionCode;
}

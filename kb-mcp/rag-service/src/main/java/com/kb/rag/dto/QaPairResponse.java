package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QaPairResponse {

    private String pairId;
    private String datasetId;
    private String question;
    private String answer;
    private String qaType;
    private String[] sourceChunkIds;
    private String sourceDocPath;
    private String difficulty;
    private String[] tags;
    private Map<String, Object> metadata;
    private Instant createdAt;
}

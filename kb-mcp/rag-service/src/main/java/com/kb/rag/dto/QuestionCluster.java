package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionCluster {
    private String clusterKey;
    private String representativeQuery;
    private long count;
    private double avgResponseMs;
    private double refusalRate;
    private double avgCitations;
}

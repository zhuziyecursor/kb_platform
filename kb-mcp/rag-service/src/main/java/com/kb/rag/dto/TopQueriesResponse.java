package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TopQueriesResponse {

    private String queryText;
    private long count;
    private double avgTotalMs;
    private int avgCitations;
    private double refusalRate;
    private Instant lastSeen;
}

package com.kb.rag.dto;

import lombok.Data;

import java.util.List;

@Data
public class RerankResponse {
    private List<Result> results;

    @Data
    public static class Result {
        private int index;
        private double score;
    }
}

package com.kb.llm.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
public class MinimaxRequest {
    private String model;
    private List<MinimaxMessage> messages;
    private double temperature;

    @JsonProperty("max_tokens")
    private int maxTokens;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MinimaxMessage {
        private String role;
        private String content;
    }
}

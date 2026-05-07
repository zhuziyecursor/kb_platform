package com.kb.rag.dto;

import lombok.Data;

@Data
public class LlmGatewayResponse {
    private String id;
    private String model;
    private Choice choice;

    @Data
    public static class Choice {
        private String finishReason;
        private LlmGatewayRequest.Message message;
    }
}

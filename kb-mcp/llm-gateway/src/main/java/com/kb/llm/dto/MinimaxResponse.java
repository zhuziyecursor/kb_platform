package com.kb.llm.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

@Data
public class MinimaxResponse {
    @JsonProperty("base_resp")
    private BaseResp baseResp;
    private String id;
    private String model;
    private List<Choice> choices;
    private Usage usage;

    @Data
    public static class BaseResp {
        @JsonProperty("status_code")
        private int statusCode;
        @JsonProperty("status_msg")
        private String statusMsg;
    }

    public boolean isSuccess() {
        return baseResp == null || baseResp.statusCode == 0;
    }

    public String errorMessage() {
        return baseResp != null ? baseResp.statusMsg : null;
    }

    @Data
    public static class Choice {
        @JsonProperty("finish_reason")
        private String finishReason;
        private Message message;
        private int index;

        @Data
        public static class Message {
            private String role;
            private String content;
        }
    }

    @Data
    public static class Usage {
        @JsonProperty("prompt_tokens")
        private int promptTokens;

        @JsonProperty("completion_tokens")
        private int completionTokens;

        @JsonProperty("total_tokens")
        private int totalTokens;
    }
}

package com.kb.rag.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ChatRequest {

    @NotBlank
    private String tenantId;

    private String sessionId;

    private String biz;

    private String lang = "zh";

    @NotBlank
    private String query;

    private Integer topK = 20;

    private String spaceId;
}

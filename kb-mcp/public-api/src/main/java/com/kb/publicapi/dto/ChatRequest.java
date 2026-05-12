package com.kb.publicapi.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ChatRequest {

    @NotBlank
    private String query;

    private String sessionId;

    private String biz;

    private String lang = "zh";

    private Integer topK = 20;

    private String spaceId;
}

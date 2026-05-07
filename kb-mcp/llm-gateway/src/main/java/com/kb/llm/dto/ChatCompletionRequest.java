package com.kb.llm.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class ChatCompletionRequest {

    @NotBlank
    private String model;

    @NotEmpty
    private List<Message> messages;

    private Double temperature;

    private Integer maxTokens;
}

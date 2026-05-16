package com.kb.rag.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;

@Data
public class CreateEvalRunRequest {

    @NotBlank
    private String datasetId;

    private String tenantId = "default";

    private Map<String, Object> config;
}

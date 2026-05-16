package com.kb.rag.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class CreateDatasetRequest {

    @NotBlank
    private String name;

    private String description;

    @NotBlank
    private String sourceType;

    private String sourcePath;

    private List<String> fileList;

    private String tenantId = "default";

    private Map<String, Object> qaConfig;
}

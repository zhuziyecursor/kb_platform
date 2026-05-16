package com.kb.rag.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class BadcaseStatusRequest {
    @NotBlank
    @Pattern(regexp = "REVIEWED|RESOLVED|DISMISSED")
    private String status;
}

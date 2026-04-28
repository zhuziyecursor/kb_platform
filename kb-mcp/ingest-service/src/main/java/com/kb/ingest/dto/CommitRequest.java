package com.kb.ingest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommitRequest {

    @NotBlank
    private String tenantId;

    @NotBlank
    @Pattern(regexp = "^[0-9a-f]{64}$")
    private String sha256;

    @NotEmpty
    private List<AclEntry> acl;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AclEntry {
        @NotBlank
        private String accessorType;

        @NotBlank
        private String accessorId;

        @Builder.Default
        private String permission = "READ";
    }
}
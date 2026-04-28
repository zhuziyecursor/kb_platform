package com.kb.ingest.dto;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InitUploadRequest {

    @NotBlank
    private String tenantId;

    @NotBlank
    private String filename;

    @NotNull
    @Max(52428800)
    private Long fileSize;

    @NotBlank
    @Pattern(regexp = "^[0-9a-f]{64}$")
    private String fileHash;

    @NotBlank
    private String docType;

    @NotBlank
    private String bizDomain;

    @Builder.Default
    private String regionCode = "CN-NATIONAL";

    @Builder.Default
    private Integer secLevel = 1;

    private String effectiveFrom;

    @NotBlank
    private String ownerUid;

    @NotBlank
    private String deptId;

    @Builder.Default
    private String knowledgeSpaceId = "DEFAULT";

    private ChunkConfigDto chunkConfig;

    @Builder.Default
    private Boolean overwriteExisting = false;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChunkConfigDto {
        @Builder.Default
        private Boolean useSpaceConfig = true;
        @Min(100)
        @Max(2000)
        private Integer chunkSize;
        @Min(0)
        @Max(50)
        private Integer overlapRatio;
        private String chunkMode;
    }
}
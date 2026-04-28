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
public class CreateSpaceRequest {

    @NotBlank(message = "知识空间名称不能为空")
    @Size(max = 128, message = "名称长度不能超过128字符")
    private String name;

    @Size(max = 512, message = "描述长度不能超过512字符")
    private String description;

    @Min(value = 100, message = "段长度最小100字符")
    @Max(value = 2000, message = "段长度最大2000字符")
    @Builder.Default
    private Integer chunkSize = 512;

    @Min(value = 0, message = "重叠率最小0%")
    @Max(value = 50, message = "重叠率最大50%")
    @Builder.Default
    private Integer overlapRatio = 10;

    @Builder.Default
    private String chunkMode = "HEAD_FIRST";

    @Builder.Default
    private String visibility = "TEAM";
}
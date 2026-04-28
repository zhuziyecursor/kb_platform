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
public class UpdateSpaceRequest {

    @Size(max = 128, message = "名称长度不能超过128字符")
    private String name;

    @Size(max = 512, message = "描述长度不能超过512字符")
    private String description;

    @Min(value = 100, message = "段长度最小100字符")
    @Max(value = 2000, message = "段长度最大2000字符")
    private Integer chunkSize;

    @Min(value = 0, message = "重叠率最小0%")
    @Max(value = 50, message = "重叠率最大50%")
    private Integer overlapRatio;

    private String chunkMode;

    private String visibility;
}
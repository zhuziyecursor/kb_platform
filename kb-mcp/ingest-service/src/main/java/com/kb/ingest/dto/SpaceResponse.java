package com.kb.ingest.dto;

import com.kb.ingest.entity.KnowledgeSpace;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SpaceResponse {

    private String id;
    private String tenantId;
    private String name;
    private String description;
    private Integer chunkSize;
    private Integer overlapRatio;
    private String chunkMode;
    private String visibility;
    private Long docCount;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public static SpaceResponse fromEntity(KnowledgeSpace space) {
        return SpaceResponse.builder()
                .id(space.getId())
                .tenantId(space.getTenantId())
                .name(space.getName())
                .description(space.getDescription())
                .chunkSize(space.getChunkSize())
                .overlapRatio(space.getOverlapRatio())
                .chunkMode(space.getChunkMode())
                .visibility(space.getVisibility())
                .createTime(space.getCreateTime())
                .updateTime(space.getUpdateTime())
                .build();
    }

    public static SpaceResponse fromEntity(KnowledgeSpace space, Long docCount) {
        SpaceResponse response = fromEntity(space);
        response.setDocCount(docCount);
        return response;
    }
}
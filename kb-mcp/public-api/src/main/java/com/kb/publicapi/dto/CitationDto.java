package com.kb.publicapi.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CitationDto {
    private Integer index;
    private String docId;
    private String title;
    private Integer version;
    private Integer chunkSeq;
    private Integer page;
    private String sectionPath;
    private String spaceId;
    private String spacePath;
    private Double score;
    private Boolean isCurrent;
    private String effectiveFrom;
    private String effectiveTo;
    private String text;
    private List<String> sourceChannels;
    private Map<String, Integer> channelRanks;
}

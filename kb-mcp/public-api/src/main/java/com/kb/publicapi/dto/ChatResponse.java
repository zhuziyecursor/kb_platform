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
public class ChatResponse {
    private String answer;
    private List<CitationDto> citations;
    private String traceId;
    private String reason;
    private String sessionId;
    private String confidence;
    private Map<String, Integer> channelStats;
}

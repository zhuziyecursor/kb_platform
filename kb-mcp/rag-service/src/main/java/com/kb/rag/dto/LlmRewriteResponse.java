package com.kb.rag.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class LlmRewriteResponse {
    private String mainQuery;
    private List<String> subQueries;
    private List<String> keywords;
    private String intent;
    private String queryType;
    private List<String> tagFilters;
    private String chunkTypeFilter;
}

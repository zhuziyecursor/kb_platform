package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RerankRequest {
    private String query;
    private List<RerankDocument> documents;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RerankDocument {
        private String text;
    }
}

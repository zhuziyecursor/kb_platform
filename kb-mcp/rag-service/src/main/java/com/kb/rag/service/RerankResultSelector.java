package com.kb.rag.service;

import com.kb.rag.config.RerankProperties;
import com.kb.rag.dto.MilvusSearchResult;
import com.kb.rag.dto.RerankResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class RerankResultSelector {

    private final RerankProperties properties;

    public List<MilvusSearchResult> select(List<MilvusSearchResult> source,
                                           List<RerankResponse.Result> rerankResults) {
        List<MilvusSearchResult> results = new ArrayList<>();
        if (source == null || source.isEmpty() || rerankResults == null || rerankResults.isEmpty()) {
            return results;
        }

        for (RerankResponse.Result r : rerankResults) {
            if (r.getIndex() < 0 || r.getIndex() >= source.size()) {
                continue;
            }
            if (r.getScore() < properties.getMinScore()) {
                continue;
            }

            MilvusSearchResult mr = source.get(r.getIndex());
            mr.setVectorScore(r.getScore());
            results.add(mr);
            if (results.size() >= properties.getFinalTopK()) {
                break;
            }
        }
        return results;
    }
}

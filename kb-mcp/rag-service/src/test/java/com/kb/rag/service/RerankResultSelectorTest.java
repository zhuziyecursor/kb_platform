package com.kb.rag.service;

import com.kb.rag.config.RerankProperties;
import com.kb.rag.dto.MilvusSearchResult;
import com.kb.rag.dto.RerankResponse;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RerankResultSelectorTest {

    @Test
    void filtersLowScoreResultsAndKeepsConfiguredTopK() {
        RerankProperties properties = new RerankProperties();
        properties.setMinScore(0.3);
        properties.setFinalTopK(2);
        RerankResultSelector selector = new RerankResultSelector(properties);

        List<MilvusSearchResult> source = List.of(
                result("doc-0"),
                result("doc-1"),
                result("doc-2"),
                result("doc-3")
        );
        List<RerankResponse.Result> rerankResults = List.of(
                rerank(1, 0.91),
                rerank(2, 0.29),
                rerank(3, 0.75),
                rerank(0, 0.70)
        );

        List<MilvusSearchResult> selected = selector.select(source, rerankResults);

        assertThat(selected).extracting(MilvusSearchResult::getDocId)
                .containsExactly("doc-1", "doc-3");
        assertThat(selected).extracting(MilvusSearchResult::getVectorScore)
                .containsExactly(0.91, 0.75);
    }

    private static MilvusSearchResult result(String docId) {
        return MilvusSearchResult.builder().docId(docId).build();
    }

    private static RerankResponse.Result rerank(int index, double score) {
        RerankResponse.Result result = new RerankResponse.Result();
        result.setIndex(index);
        result.setScore(score);
        return result;
    }
}

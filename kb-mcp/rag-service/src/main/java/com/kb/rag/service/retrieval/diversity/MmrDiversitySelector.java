package com.kb.rag.service.retrieval.diversity;

import com.kb.rag.dto.MilvusSearchResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * MMR (Maximal Marginal Relevance) diversity selector.
 *
 * Applied after rerank: expands the pool from top-5 to top-10,
 * then applies parent-collapse + MMR to select the final diverse top-5.
 */
@Slf4j
@Service
public class MmrDiversitySelector {

    @Value("${app.retrieval.diversity.mmr-lambda:0.7}")
    private double lambda;

    @Value("${app.retrieval.diversity.parent-collapse:true}")
    private boolean parentCollapse;

    @Value("${app.retrieval.diversity.pool-size:10}")
    private int poolSize;

    @Value("${app.retrieval.rerank.mmr-output-top-k:5}")
    private int mmrOutputTopK;

    public List<MilvusSearchResult> select(List<MilvusSearchResult> reranked) {
        if (reranked.isEmpty()) return reranked;

        List<MilvusSearchResult> pool = new ArrayList<>(reranked);
        if (pool.size() > poolSize) {
            pool = new ArrayList<>(pool.subList(0, poolSize));
        }

        // Step 1: parent-collapse — keep only the highest-scoring chunk per parent
        List<MilvusSearchResult> candidates = parentCollapse ? collapseByParent(pool) : new ArrayList<>(pool);
        if (candidates.size() <= mmrOutputTopK) {
            return candidates;
        }

        // Step 2: MMR iterative selection
        List<MilvusSearchResult> selected = new ArrayList<>();
        selected.add(candidates.remove(0));

        while (selected.size() < mmrOutputTopK && !candidates.isEmpty()) {
            int bestIdx = -1;
            double bestScore = Double.NEGATIVE_INFINITY;

            for (int i = 0; i < candidates.size(); i++) {
                MilvusSearchResult cand = candidates.get(i);
                double rel = cand.getVectorScore();
                double maxSim = selected.stream()
                        .mapToDouble(s -> CharTrigramJaccard.similarity(
                                nvl(cand.getText()), nvl(s.getText())))
                        .max()
                        .orElse(0);
                double mmr = lambda * rel - (1 - lambda) * maxSim;
                if (mmr > bestScore) {
                    bestScore = mmr;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0) {
                selected.add(candidates.remove(bestIdx));
            } else {
                break;
            }
        }

        log.debug("MMR: {} -> {} after parent-collapse + MMR", reranked.size(), selected.size());
        return selected;
    }

    private List<MilvusSearchResult> collapseByParent(List<MilvusSearchResult> in) {
        Map<String, MilvusSearchResult> byParent = new LinkedHashMap<>();
        for (MilvusSearchResult r : in) {
            String parentRef = r.getParentRef();
            String text = r.getText();
            // Short-text fallback: if text < 30 chars, use docId as grouping key
            String key;
            if (parentRef != null && !parentRef.isEmpty()) {
                key = parentRef;
            } else if (text != null && text.length() < 30) {
                key = "__short__" + r.getDocId();
            } else {
                key = "__solo__" + r.getDocId() + "|" + r.getChunkSeq();
            }
            byParent.merge(key, r, (old, neu) ->
                    old.getVectorScore() >= neu.getVectorScore() ? old : neu);
        }
        return new ArrayList<>(byParent.values());
    }

    private static String nvl(String s) {
        return s != null ? s : "";
    }
}

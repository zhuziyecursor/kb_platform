package com.kb.rag.service.retrieval.channel;

import com.kb.rag.dto.Bm25SearchResult;
import com.kb.rag.service.Bm25SearchService;
import com.kb.rag.service.retrieval.RetrievalPlan;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Sparse (BM25) retrieval channel wrapping Bm25SearchService.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SparseChannel implements RetrievalChannel {

    private final Bm25SearchService bm25SearchService;

    @Value("${app.retrieval.channels.sparse.enabled:true}")
    private boolean enabled;

    @Override
    public RetrievalPlan.ChannelId id() {
        return RetrievalPlan.ChannelId.SPARSE;
    }

    @Override
    public boolean isApplicable(RetrievalPlan plan) {
        return enabled && plan.enabledChannels().contains(RetrievalPlan.ChannelId.SPARSE);
    }

    @Override
    public List<ChannelHit> retrieve(RetrievalPlan plan, int topK) {
        List<Bm25SearchResult> results = bm25SearchService.search(
                plan.rewrittenQuery(), plan.tenantId());

        List<ChannelHit> hits = new ArrayList<>();
        int rank = 1;
        for (Bm25SearchResult r : results) {
            hits.add(new ChannelHit(
                    RetrievalPlan.ChannelId.SPARSE,
                    r.getDocId(), r.getVersion(), r.getChunkSeq(),
                    rank++, r.getBm25Score(),
                    r.getTextSnippet(), r.getTitle(),
                    r.getSecLevel(), r.getPermGroupId(),
                    r.getEffectiveTo(), r.getRegionCode(),
                    Map.of()));
        }
        log.debug("SparseChannel: {} results for query='{}'", hits.size(), plan.rewrittenQuery());
        return hits;
    }
}

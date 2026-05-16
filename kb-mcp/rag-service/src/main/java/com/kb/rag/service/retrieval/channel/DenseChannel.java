package com.kb.rag.service.retrieval.channel;

import com.kb.rag.dto.MilvusSearchResult;
import com.kb.rag.service.MilvusSearchService;
import com.kb.rag.service.retrieval.RetrievalContext;
import com.kb.rag.service.retrieval.RetrievalPlan;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Dense vector retrieval channel wrapping {@link MilvusSearchService}.
 *
 * <p>Driven by {@link ChannelExecutor} via {@link RetrievalContext}, which carries
 * the per-request query embedding and ACL context. Sub-query expansion is
 * deferred until the embedding batch API ships (sub-query-max=1 default).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DenseChannel implements RetrievalChannel {

    private final MilvusSearchService milvusSearchService;

    @Value("${app.retrieval.channels.dense.enabled:true}")
    private boolean enabled;

    @Override
    public RetrievalPlan.ChannelId id() {
        return RetrievalPlan.ChannelId.DENSE;
    }

    @Override
    public boolean isApplicable(RetrievalPlan plan) {
        return enabled && plan.enabledChannels().contains(RetrievalPlan.ChannelId.DENSE);
    }

    @Override
    public List<ChannelHit> retrieve(RetrievalPlan plan, int topK) {
        // Dense needs the per-request query vector. Cannot run without RetrievalContext.
        throw new UnsupportedOperationException(
                "DenseChannel requires RetrievalContext.queryVector; call retrieve(RetrievalContext, topK)");
    }

    @Override
    public List<ChannelHit> retrieve(RetrievalContext ctx, int topK) {
        List<Float> queryVector = ctx.queryVector();
        if (queryVector == null || queryVector.isEmpty()) {
            throw new IllegalStateException("DenseChannel: empty queryVector");
        }

        List<MilvusSearchResult> results = milvusSearchService.search(
                queryVector, ctx.plan().tenantId(),
                ctx.userSecLevel(), ctx.permGroupIds(), topK);

        // Defense-in-depth ACL post-filter (Milvus may return stale rows).
        results = milvusSearchService.filterByAcl(results, ctx.userSecLevel(), ctx.permGroupIds());

        List<ChannelHit> hits = new ArrayList<>(results.size());
        int rank = 1;
        for (MilvusSearchResult r : results) {
            hits.add(new ChannelHit(
                    RetrievalPlan.ChannelId.DENSE,
                    r.getDocId(), r.getVersion(), r.getChunkSeq(),
                    rank++, r.getVectorScore(),
                    r.getText(), r.getTitle(),
                    r.getSecLevel(), r.getPermGroupId(),
                    r.getEffectiveTo(), r.getRegionCode(),
                    Map.of("sectionPath", nvl(r.getSectionPath()),
                           "page", r.getPage(),
                           "parentRef", nvl(r.getParentRef()))));
        }
        log.debug("DenseChannel: {} results for query='{}'", hits.size(), ctx.plan().rewrittenQuery());
        return hits;
    }

    /**
     * @deprecated Retained only for callers outside the executor path.
     *     Prefer {@link #retrieve(RetrievalContext, int)}.
     */
    @Deprecated
    public List<ChannelHit> retrieveWithVector(RetrievalPlan plan, List<Float> queryVector,
                                                int userSecLevel, List<Long> permGroupIds, int topK) {
        return retrieve(new RetrievalContext(plan, queryVector, userSecLevel, permGroupIds), topK);
    }

    private static String nvl(String s) { return s != null ? s : ""; }
}

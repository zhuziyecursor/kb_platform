package com.kb.rag.service.retrieval.channel;

import com.kb.rag.service.retrieval.RetrievalContext;
import com.kb.rag.service.retrieval.RetrievalPlan;

import java.util.List;

public interface RetrievalChannel {
    RetrievalPlan.ChannelId id();

    default boolean isApplicable(RetrievalContext ctx) {
        return isApplicable(ctx.plan());
    }

    default List<ChannelHit> retrieve(RetrievalContext ctx, int topK) {
        return retrieve(ctx.plan(), topK);
    }

    boolean isApplicable(RetrievalPlan plan);

    List<ChannelHit> retrieve(RetrievalPlan plan, int topK);
}

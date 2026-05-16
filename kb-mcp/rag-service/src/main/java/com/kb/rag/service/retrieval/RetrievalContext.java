package com.kb.rag.service.retrieval;

import java.util.List;

/**
 * Per-request context handed to every {@link com.kb.rag.service.retrieval.channel.RetrievalChannel}
 * by {@link ChannelExecutor}. Carries the planning result plus runtime data
 * that varies per request (the query embedding and ACL context).
 *
 * <p>Channels that don't need the vector / ACL fields just ignore them.</p>
 */
public record RetrievalContext(
        RetrievalPlan plan,
        List<Float> queryVector,
        int userSecLevel,
        List<Long> permGroupIds
) {
    public static RetrievalContext withoutVector(RetrievalPlan plan,
                                                  int userSecLevel,
                                                  List<Long> permGroupIds) {
        return new RetrievalContext(plan, List.of(), userSecLevel, permGroupIds);
    }
}

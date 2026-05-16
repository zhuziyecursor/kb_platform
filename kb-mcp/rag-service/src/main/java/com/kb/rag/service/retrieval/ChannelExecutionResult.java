package com.kb.rag.service.retrieval;

import com.kb.rag.service.retrieval.channel.ChannelHit;

import java.util.*;

/**
 * Tracks which retrieval channels succeeded or failed, and carries per-channel results.
 */
public record ChannelExecutionResult(
        Map<RetrievalPlan.ChannelId, List<ChannelHit>> channelResults,
        Set<String> successfulChannels,
        Map<String, String> failedChannels
) {
    public static final String DENSE = "DENSE";
    public static final String SPARSE = "SPARSE";
    public static final String STRUCTURED = "STRUCTURED";
    public static final String METADATA = "METADATA";
    public static final String FAQ = "FAQ";

    public boolean isDenseFailed() {
        return failedChannels.containsKey(DENSE);
    }

    public Set<RetrievalPlan.ChannelId> successfulChannelIds() {
        Set<RetrievalPlan.ChannelId> ids = EnumSet.noneOf(RetrievalPlan.ChannelId.class);
        for (String name : successfulChannels) {
            try {
                ids.add(RetrievalPlan.ChannelId.valueOf(name));
            } catch (IllegalArgumentException ignored) {
            }
        }
        return ids;
    }

    public static ChannelExecutionResult allSuccess() {
        return new ChannelExecutionResult(Map.of(), Set.of(DENSE, SPARSE), Map.of());
    }

    public static ChannelExecutionResult withFailure(String channel, String reason) {
        Set<String> successful = new LinkedHashSet<>(Set.of(DENSE, SPARSE, STRUCTURED, FAQ));
        successful.remove(channel);
        return new ChannelExecutionResult(Map.of(),
                Collections.unmodifiableSet(successful),
                Map.of(channel, reason));
    }
}

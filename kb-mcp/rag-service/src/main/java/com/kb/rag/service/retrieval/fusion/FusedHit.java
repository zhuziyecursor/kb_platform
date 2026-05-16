package com.kb.rag.service.retrieval.fusion;

import com.kb.rag.service.retrieval.RetrievalPlan;
import com.kb.rag.service.retrieval.channel.ChannelHit;

import java.util.Map;

public record FusedHit(
        String docId,
        int version,
        int chunkSeq,
        double fusionScore,
        Map<RetrievalPlan.ChannelId, Integer> channelRanks,
        Map<RetrievalPlan.ChannelId, Double> channelScores,
        ChannelHit representative
) {}

package com.kb.rag.service.retrieval.channel;

import com.kb.rag.service.retrieval.RetrievalPlan;

import java.util.Map;

public record ChannelHit(
        RetrievalPlan.ChannelId channel,
        String docId,
        int version,
        int chunkSeq,
        int rank,
        double rawScore,
        String text,
        String title,
        int secLevel,
        long permGroupId,
        String effectiveTo,
        String regionCode,
        Map<String, Object> meta
) {}

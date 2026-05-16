package com.kb.rag.service.retrieval.attribution;

import com.kb.rag.dto.Bm25SearchResult;
import com.kb.rag.dto.CitationDto;
import com.kb.rag.dto.MilvusSearchResult;
import com.kb.rag.service.RRFFusionService;
import com.kb.rag.service.retrieval.RetrievalPlan;
import com.kb.rag.service.retrieval.channel.ChannelHit;
import com.kb.rag.service.retrieval.fusion.FusedHit;
import com.kb.rag.service.retrieval.fusion.HybridFusionService;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Centralized channel attribution — annotates citations and trace data with
 * which retrieval channels (DENSE, SPARSE, STRUCTURED, FAQ) contributed each result.
 *
 * <p>Used by both legacy (RRF) and hybrid retrieval paths so that every citation
 * carries {@code sourceChannels} and every response carries {@code channelStats}.</p>
 */
@Service
public class ChannelAttribution {

    // ---- Annotation ----

    /** Annotate each citation with its source channels from a pre-built channel map. */
    public void annotateCitations(List<CitationDto> citations,
                                  Map<String, Set<String>> channelMap) {
        for (CitationDto c : citations) {
            String key = HybridFusionService.buildKey(c.getDocId(), c.getVersion(), c.getChunkSeq());
            Set<String> channels = channelMap.getOrDefault(key, Set.of("DENSE"));
            c.setSourceChannels(channels);
        }
    }

    /** Annotate each citation with sourceChannels and channelRanks resolved from {@link FusedHit} records. */
    public void annotateCitationsFromFused(List<CitationDto> citations,
                                           List<FusedHit> fused) {
        Map<String, FusedHit> fusedByKey = new LinkedHashMap<>();
        for (FusedHit fh : fused) {
            String key = HybridFusionService.buildKey(fh.docId(), fh.version(), fh.chunkSeq());
            fusedByKey.putIfAbsent(key, fh);
        }
        for (CitationDto c : citations) {
            String key = HybridFusionService.buildKey(c.getDocId(), c.getVersion(), c.getChunkSeq());
            FusedHit fh = fusedByKey.get(key);
            if (fh != null) {
                Set<String> channels = new LinkedHashSet<>();
                Map<String, Integer> ranks = new LinkedHashMap<>();
                for (var e : fh.channelRanks().entrySet()) {
                    channels.add(e.getKey().name());
                    ranks.put(e.getKey().name(), e.getValue());
                }
                c.setSourceChannels(channels);
                c.setChannelRanks(ranks);
            } else {
                c.setSourceChannels(Set.of("DENSE"));
            }
        }
    }

    // ---- Channel map builders ----

    /**
     * Build a key→channels map from legacy DENSE + BM25 + fusion results.
     * Keys that appear in both dense and sparse sets are tagged with both channels.
     */
    public Map<String, Set<String>> buildChannelMap(
            List<MilvusSearchResult> denseResults,
            List<Bm25SearchResult> bm25Results,
            List<RRFFusionService.FusedResult> fused) {

        Set<String> denseKeys = denseResults.stream()
                .map(r -> HybridFusionService.buildKey(r.getDocId(), r.getVersion(), r.getChunkSeq()))
                .collect(Collectors.toSet());
        Set<String> bm25Keys = bm25Results.stream()
                .map(r -> HybridFusionService.buildKey(r.getDocId(), r.getVersion(), r.getChunkSeq()))
                .collect(Collectors.toSet());

        Map<String, Set<String>> map = new LinkedHashMap<>();
        for (RRFFusionService.FusedResult fr : fused) {
            String key = HybridFusionService.buildKey(fr.docId(), fr.version(), fr.chunkSeq());
            Set<String> channels = new LinkedHashSet<>();
            if (fr.fromDense() || denseKeys.contains(key)) channels.add("DENSE");
            if (fr.fromBm25() || bm25Keys.contains(key)) channels.add("SPARSE");
            if (channels.isEmpty()) channels.add("DENSE");
            map.put(key, channels);
        }
        return map;
    }

    /**
     * Build a key→channels map from hybrid {@link FusedHit} results,
     * extracting channel membership from each hit's {@code channelRanks}.
     */
    public Map<String, Set<String>> buildChannelMapFromFused(List<FusedHit> fused) {
        Map<String, Set<String>> map = new LinkedHashMap<>();
        for (FusedHit fh : fused) {
            String key = HybridFusionService.buildKey(fh.docId(), fh.version(), fh.chunkSeq());
            Set<String> channels = new LinkedHashSet<>();
            for (RetrievalPlan.ChannelId cid : fh.channelRanks().keySet()) {
                channels.add(cid.name());
            }
            if (channels.isEmpty()) {
                channels.add("DENSE");
            }
            map.put(key, channels);
        }
        return map;
    }

    // ---- Channel stats for ChatResponse ----

    /** Build channel hit counts for the legacy (RRF) path. */
    public Map<String, Integer> buildChannelStats(
            List<RRFFusionService.FusedResult> fused,
            boolean clauseMatched) {
        Map<String, Integer> stats = new LinkedHashMap<>();
        int denseHits = (int) fused.stream().filter(RRFFusionService.FusedResult::fromDense).count();
        int bm25Hits = (int) fused.stream().filter(RRFFusionService.FusedResult::fromBm25).count();
        int bothHits = (int) fused.stream().filter(fr -> fr.fromDense() && fr.fromBm25()).count();

        if (denseHits > 0) stats.put("DENSE", denseHits);
        if (bm25Hits > 0) stats.put("SPARSE", bm25Hits);
        if (bothHits > 0) stats.put("BOTH", bothHits);
        stats.put("TOTAL_UNIQUE", fused.size());
        if (clauseMatched) stats.put("CLAUSE_MATCHED", 1);

        return stats;
    }

    /** Build channel hit counts for the hybrid path. */
    public Map<String, Integer> buildChannelStats(
            Map<RetrievalPlan.ChannelId, List<ChannelHit>> allHits) {
        Map<String, Integer> stats = new LinkedHashMap<>();
        for (Map.Entry<RetrievalPlan.ChannelId, List<ChannelHit>> e : allHits.entrySet()) {
            if (!e.getValue().isEmpty()) {
                stats.put(e.getKey().name(), e.getValue().size());
            }
        }
        return stats;
    }

    // ---- Trace summary ----

    /** Build a channel-hits summary map for writing to {@code rag_pipeline_trace.channel_hits}. */
    public Map<String, Object> channelHitsSummary(
            Map<RetrievalPlan.ChannelId, List<ChannelHit>> allHits) {
        Map<String, Object> summary = new LinkedHashMap<>();
        for (Map.Entry<RetrievalPlan.ChannelId, List<ChannelHit>> e : allHits.entrySet()) {
            summary.put(e.getKey().name(), e.getValue().size());
        }
        return summary;
    }
}

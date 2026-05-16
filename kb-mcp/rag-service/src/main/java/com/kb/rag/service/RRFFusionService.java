package com.kb.rag.service;

import com.kb.rag.dto.Bm25SearchResult;
import com.kb.rag.dto.MilvusSearchResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * RRF (Reciprocal Rank Fusion) 多路融合服务。
 *
 * 融合 Dense（Milvus 向量检索） + BM25（关键词检索） + FAQ（高置信短路）
 * 三路结果，取最优 TopK，实现检索增强的最后一环。
 *
 * 公式：score_rrf = 1/(k + rank_dense) + 1/(k + rank_bm25) + w_faq * score_faq
 * k = 60 (RRF 标准参数)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RRFFusionService {

    @Value("${app.rrf.k:60}")
    private int rrfK;

    @Value("${app.rrf.faq-boost-weight:2.0}")
    private double faqBoostWeight;

    /**
     * Fuse Dense + BM25 results using RRF.
     *
     * @param denseResults Milvus dense vector search results
     * @param bm25Results  BM25 keyword search results
     * @return fused results sorted by RRF score descending
     */
    public List<FusedResult> fuse(List<MilvusSearchResult> denseResults,
                                   List<Bm25SearchResult> bm25Results) {
        // Build RRF score map: key = "docId|chunkSeq"
        Map<String, Double> rrfScores = new LinkedHashMap<>();
        Map<String, MilvusSearchResult> denseMap = new LinkedHashMap<>();
        Map<String, Bm25SearchResult> bm25Map = new LinkedHashMap<>();

        // Dense rank
        for (int i = 0; i < denseResults.size(); i++) {
            MilvusSearchResult r = denseResults.get(i);
            String key = buildKey(r.getDocId(), r.getVersion(), r.getChunkSeq());
            double rrfScore = 1.0 / (rrfK + i + 1);
            rrfScores.merge(key, rrfScore, Double::sum);
            denseMap.putIfAbsent(key, r);
        }

        // BM25 rank
        for (int i = 0; i < bm25Results.size(); i++) {
            Bm25SearchResult r = bm25Results.get(i);
            String key = buildKey(r.getDocId(), r.getVersion(), r.getChunkSeq());
            double rrfScore = 1.0 / (rrfK + i + 1);
            rrfScores.merge(key, rrfScore, Double::sum);
            bm25Map.putIfAbsent(key, r);
        }

        // Sort by RRF score
        List<Map.Entry<String, Double>> sorted = rrfScores.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .toList();

        List<FusedResult> results = new ArrayList<>();
        for (Map.Entry<String, Double> entry : sorted) {
            String key = entry.getKey();
            double rrfScore = entry.getValue();
            MilvusSearchResult denseHit = denseMap.get(key);
            Bm25SearchResult bm25Hit = bm25Map.get(key);
            String docId = denseHit != null ? denseHit.getDocId()
                    : (bm25Hit != null ? bm25Hit.getDocId() : "");
            int version = denseHit != null ? denseHit.getVersion()
                    : (bm25Hit != null ? bm25Hit.getVersion() : 0);
            int chunkSeq = denseHit != null ? denseHit.getChunkSeq()
                    : (bm25Hit != null ? bm25Hit.getChunkSeq() : 0);
            String text = denseHit != null ? denseHit.getText()
                    : (bm25Hit != null ? bm25Hit.getTextSnippet() : "");
            String title = denseHit != null ? denseHit.getTitle()
                    : (bm25Hit != null ? bm25Hit.getTitle() : "");
            boolean fromDense = denseHit != null;
            boolean fromBm25 = bm25Hit != null;

            results.add(new FusedResult(docId, version, chunkSeq, rrfScore, text, title,
                    fromDense, fromBm25, denseHit));
        }

        log.debug("RRF fusion: {} dense + {} bm25 -> {} fused results",
                denseResults.size(), bm25Results.size(), results.size());
        return results;
    }

    /**
     * Merge FAQ matches into RRF results as high-score bonus.
     */
    public List<FusedResult> mergeFaq(List<FusedResult> fused,
                                       FaqService.FaqMatch faqMatch,
                                       List<MilvusSearchResult> faqChunks) {
        if (faqMatch == null) return fused;
        // FAQ match adds boost to results from the matching space
        // For now, return fused as-is — FAQ accelerates via shortcut, not fusion
        return fused;
    }

    private String buildKey(String docId, int version, int chunkSeq) {
        return docId + "|" + version + "|" + chunkSeq;
    }

    public record FusedResult(
            String docId,
            int version,
            int chunkSeq,
            double rrfScore,
            String text,
            String title,
            boolean fromDense,
            boolean fromBm25,
            MilvusSearchResult denseResult
    ) {}
}

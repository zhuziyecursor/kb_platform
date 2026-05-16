package com.kb.rag.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * FAQ 高置信短路服务。
 *
 * 在完整 RAG pipeline 之前，尝试匹配预置 FAQ 答案。
 * 当 query 向量与 FAQ 问题向量的余弦相似度 > threshold 时直接返回预置答案。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FaqService {

    private final FaqStore faqStore;
    private final EmbeddingServiceClient embeddingClient;

    @Value("${app.faq.enabled:true}")
    private boolean enabled;

    @Value("${app.faq.similarity-threshold:0.95}")
    private double similarityThreshold;

    @Value("${app.faq.max-results:3}")
    private int maxResults;

    public record FaqMatch(String question, String answer, double score) {}

    /**
     * Try to match query against FAQ store.
     *
     * @param query       user query
     * @param queryVector pre-computed query embedding (may be null, will compute)
     * @param tenantId    tenant ID
     * @return best match or null if no FAQ passes threshold
     */
    public FaqMatch match(String query, List<Float> queryVector, String tenantId,
                          int userSecLevel, List<Long> permGroupIds) {
        if (!enabled) return null;

        List<FaqStore.FaqEntry> entries = faqStore.getEntries(tenantId);
        if (entries.isEmpty()) return null;

        List<Float> vector = queryVector;
        if (vector == null || vector.isEmpty()) {
            try {
                vector = embeddingClient.embed(query);
            } catch (Exception e) {
                log.warn("FAQ: failed to embed query: {}", e.getMessage());
                return null;
            }
        }

        List<FaqMatch> matches = new ArrayList<>();
        for (FaqStore.FaqEntry entry : entries) {
            if (entry.embedding() == null || entry.embedding().isEmpty()) continue;
            // ACL — strict: permGroupId must be in the user's groups.
            // perm_group_id=0 is the "no one matches" backfill default, not public.
            if (entry.secLevel() > userSecLevel) continue;
            if (!permGroupIds.contains(entry.permGroupId())) continue;
            double similarity = cosineSimilarity(vector, entry.embedding());
            if (similarity >= similarityThreshold) {
                matches.add(new FaqMatch(entry.question(), entry.answer(), similarity));
            }
        }

        if (matches.isEmpty()) return null;

        matches.sort(Comparator.comparingDouble(FaqMatch::score).reversed());
        FaqMatch best = matches.get(0);
        log.info("FAQ shortcut hit: query='{}' matched='{}' score={:.4f}",
                query, best.question(), best.score());
        return best;
    }

    private double cosineSimilarity(List<Float> a, List<Float> b) {
        if (a.size() != b.size()) return 0.0;
        double dot = 0.0, normA = 0.0, normB = 0.0;
        for (int i = 0; i < a.size(); i++) {
            double va = a.get(i);
            double vb = b.get(i);
            dot += va * vb;
            normA += va * va;
            normB += vb * vb;
        }
        if (normA == 0.0 || normB == 0.0) return 0.0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}

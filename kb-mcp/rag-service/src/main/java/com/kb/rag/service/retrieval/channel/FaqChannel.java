package com.kb.rag.service.retrieval.channel;

import com.kb.rag.service.FaqService;
import com.kb.rag.service.FaqStore;
import com.kb.rag.service.retrieval.RetrievalContext;
import com.kb.rag.service.retrieval.RetrievalPlan;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * FAQ retrieval channel.
 *
 * <ul>
 *   <li>Shortcut mode (score ≥ 0.95): {@link #tryShortcut} returns a pre-configured
 *       answer, bypassing fusion. Called explicitly by the chat pipeline.</li>
 *   <li>Fusion mode (0.85 ≤ score < 0.95): {@link #retrieve(RetrievalContext, int)}
 *       returns ChannelHits for fusion ranking, driven by ChannelExecutor.</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FaqChannel implements RetrievalChannel {

    private final FaqService faqService;
    private final FaqStore faqStore;

    @Value("${app.retrieval.channels.faq.enabled:true}")
    private boolean enabled;

    @Value("${app.retrieval.channels.faq.shortcut-threshold:0.95}")
    private double shortcutThreshold;

    @Value("${app.retrieval.channels.faq.fusion-threshold:0.85}")
    private double fusionThreshold;

    @Override
    public RetrievalPlan.ChannelId id() {
        return RetrievalPlan.ChannelId.FAQ;
    }

    @Override
    public boolean isApplicable(RetrievalPlan plan) {
        return enabled && plan.enabledChannels().contains(RetrievalPlan.ChannelId.FAQ);
    }

    @Override
    public List<ChannelHit> retrieve(RetrievalPlan plan, int topK) {
        throw new UnsupportedOperationException(
                "FaqChannel requires RetrievalContext.queryVector; call retrieve(RetrievalContext, topK)");
    }

    @Override
    public List<ChannelHit> retrieve(RetrievalContext ctx, int topK) {
        return retrieveForFusion(ctx.plan(), ctx.queryVector(),
                ctx.userSecLevel(), ctx.permGroupIds(), topK);
    }

    /** Shortcut mode — called directly by the chat pipeline before fusion runs. */
    public FaqService.FaqMatch tryShortcut(String query, List<Float> queryVector,
                                            String tenantId, int userSecLevel,
                                            List<Long> permGroupIds) {
        return faqService.match(query, queryVector, tenantId, userSecLevel, permGroupIds);
    }

    /** Fusion-mode candidates. */
    public List<ChannelHit> retrieveForFusion(RetrievalPlan plan, List<Float> queryVector,
                                               int userSecLevel, List<Long> permGroupIds, int topK) {
        List<FaqStore.FaqEntry> entries = faqStore.getEntries(plan.tenantId());
        if (entries.isEmpty() || queryVector == null || queryVector.isEmpty()) return List.of();

        List<FaqMatchCandidate> candidates = new ArrayList<>();
        for (FaqStore.FaqEntry entry : entries) {
            if (entry.embedding() == null || entry.embedding().isEmpty()) continue;
            if (entry.secLevel() > userSecLevel) continue;
            if (!permGroupIds.contains(entry.permGroupId())) continue;

            double similarity = cosineSimilarity(queryVector, entry.embedding());
            if (similarity >= fusionThreshold && similarity < shortcutThreshold) {
                candidates.add(new FaqMatchCandidate(entry, similarity));
            }
        }

        candidates.sort(Comparator.comparingDouble(FaqMatchCandidate::score).reversed());

        List<ChannelHit> hits = new ArrayList<>();
        int rank = 1;
        for (FaqMatchCandidate c : candidates) {
            hits.add(new ChannelHit(
                    RetrievalPlan.ChannelId.FAQ,
                    "faq_" + c.entry.id(), 0, 0,
                    rank++, c.score,
                    c.entry.answer(), c.entry.question(),
                    c.entry.secLevel(), c.entry.permGroupId(),
                    c.entry.effectiveTo(), c.entry.regionCode(),
                    Map.of("faqId", c.entry.id(), "hitCount", c.entry.hitCount())));
            if (hits.size() >= topK) break;
        }
        log.debug("FaqChannel fusion: {} candidates", hits.size());
        return hits;
    }

    private record FaqMatchCandidate(FaqStore.FaqEntry entry, double score) {}

    private double cosineSimilarity(List<Float> a, List<Float> b) {
        if (a.size() != b.size()) return 0.0;
        double dot = 0.0, normA = 0.0, normB = 0.0;
        for (int i = 0; i < a.size(); i++) {
            double va = a.get(i), vb = b.get(i);
            dot += va * vb;
            normA += va * va;
            normB += vb * vb;
        }
        if (normA == 0.0 || normB == 0.0) return 0.0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}

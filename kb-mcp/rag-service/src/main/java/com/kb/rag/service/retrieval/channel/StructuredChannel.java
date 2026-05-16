package com.kb.rag.service.retrieval.channel;

import com.kb.rag.service.KeywordFallbackService;
import com.kb.rag.service.retrieval.RetrievalPlan;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Structured (clause/section) retrieval channel.
 *
 * Activates when the query contains clause references (e.g. "第32条", "3.2.1").
 * Searches knowledge_structured via the ACL view for exact section-path matches.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StructuredChannel implements RetrievalChannel {

    private final KeywordFallbackService keywordFallbackService;

    @Value("${app.retrieval.channels.structured.enabled:true}")
    private boolean enabled;

    @Override
    public RetrievalPlan.ChannelId id() {
        return RetrievalPlan.ChannelId.STRUCTURED;
    }

    @Override
    public boolean isApplicable(RetrievalPlan plan) {
        return enabled
                && plan.clauseRefs() != null
                && !plan.clauseRefs().isEmpty()
                && plan.enabledChannels().contains(RetrievalPlan.ChannelId.STRUCTURED);
    }

    @Override
    public List<ChannelHit> retrieve(RetrievalPlan plan, int topK) {
        KeywordFallbackService.ClauseMatch match = keywordFallbackService.matchClause(
                plan.rawQuery(), plan.tenantId());

        if (!match.matched()) return List.of();

        List<ChannelHit> hits = new ArrayList<>();
        int rank = 1;
        for (KeywordFallbackService.ClauseHit h : match.hits()) {
            hits.add(new ChannelHit(
                    RetrievalPlan.ChannelId.STRUCTURED,
                    h.docId(), h.version(), 0,
                    rank++, 1.0,
                    "", h.title(),
                    h.secLevel(), h.permGroupId(),
                    h.effectiveTo(), h.regionCode(),
                    Map.of("sectionPath", h.sectionPath())));
            if (hits.size() >= topK) break;
        }
        log.debug("StructuredChannel: {} hits for clauses={}", hits.size(), plan.clauseRefs());
        return hits;
    }
}

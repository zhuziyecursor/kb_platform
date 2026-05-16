package com.kb.rag.service.retrieval;

import com.kb.rag.dto.LlmRewriteResponse;
import com.kb.rag.service.LlmQueryRewriteService;
import com.kb.rag.service.SessionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * LLM-powered QueryPlanner. Calls the upgraded LLM rewrite prompt and validates
 * the output. Falls back to RuleQueryPlanner on failure/timeout/invalid output.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LlmQueryPlanner implements QueryPlanner {

    private final LlmQueryRewriteService rewriteService;

    private static final Pattern CLAUSE_PATTERN = Pattern.compile(
            "[第][\\d一二三四五六七八九十百千]+([.．、][\\d一二三四五六七八九十]+)*[条章节]");

    private static final Pattern WESTERN_CLAUSE_PATTERN = Pattern.compile(
            "\\b(\\d+(?:\\.\\d+){1,3})\\s*[条节章]?");

    private static final int MIN_SUB_QUERY_LENGTH = 3;
    private static final int MAX_SUB_QUERY_LENGTH = 80;
    private static final double MAIN_QUERY_MAX_SIMILARITY = 0.95;

    @Value("${app.retrieval.channels.dense.sub-query-max:1}")
    private int subQueryMax;

    @Override
    public RetrievalPlan plan(String tenantId, String rawQuery,
                              List<SessionService.Turn> history) {
        LlmRewriteResponse llmResult = rewriteService.rewrite(rawQuery, history);

        if (llmResult == null) {
            log.debug("LLM rewrite returned null, plan will need rule fallback");
            return null;
        }

        String rewrittenQuery = llmResult.getMainQuery() != null
                ? llmResult.getMainQuery() : rawQuery;

        // Validate and truncate sub-queries
        List<String> subQueries = validateSubQueries(llmResult.getSubQueries(), rewrittenQuery);
        if (subQueries.size() > subQueryMax) {
            subQueries = subQueries.subList(0, subQueryMax);
        }

        List<String> keywords = llmResult.getKeywords() != null
                ? llmResult.getKeywords() : List.of();

        // Extract clause refs from raw query
        Set<String> clauseRefs = extractClauseRefs(rawQuery);

        List<String> tagFilters = llmResult.getTagFilters() != null
                ? llmResult.getTagFilters() : List.of();

        String chunkTypeFilter = llmResult.getChunkTypeFilter();

        RetrievalPlan.QueryType queryType = mapQueryType(
                llmResult.getQueryType() != null ? llmResult.getQueryType() : llmResult.getIntent());

        RetrievalPlan.RouteDecision route;
        Set<RetrievalPlan.ChannelId> channels;
        if (queryType == RetrievalPlan.QueryType.CHITCHAT) {
            route = RetrievalPlan.RouteDecision.CHITCHAT;
            channels = Set.of();
        } else {
            route = RetrievalPlan.RouteDecision.FULL_RAG;
            channels = defaultChannelsFor(queryType, !clauseRefs.isEmpty());
        }

        return new RetrievalPlan(
                null, tenantId, rawQuery, rewrittenQuery,
                subQueries, keywords, clauseRefs,
                tagFilters, chunkTypeFilter, queryType,
                route, channels);
    }

    private List<String> validateSubQueries(List<String> raw, String mainQuery) {
        if (raw == null || raw.isEmpty()) return List.of(mainQuery);
        return raw.stream()
                .filter(q -> q != null && q.length() >= MIN_SUB_QUERY_LENGTH
                        && q.length() <= MAX_SUB_QUERY_LENGTH)
                .filter(q -> charSimilarity(q, mainQuery) < MAIN_QUERY_MAX_SIMILARITY)
                .toList();
    }

    private double charSimilarity(String a, String b) {
        if (a == null || b == null) return 0;
        Set<Character> setA = new HashSet<>();
        for (char c : a.toCharArray()) setA.add(c);
        Set<Character> setB = new HashSet<>();
        for (char c : b.toCharArray()) setB.add(c);
        Set<Character> union = new HashSet<>(setA);
        union.addAll(setB);
        int intersection = 0;
        for (char c : setA) {
            if (setB.contains(c)) intersection++;
        }
        return union.isEmpty() ? 0 : (double) intersection / union.size();
    }

    private Set<String> extractClauseRefs(String query) {
        Set<String> refs = new LinkedHashSet<>();
        Matcher m1 = CLAUSE_PATTERN.matcher(query);
        while (m1.find()) refs.add(m1.group());
        Matcher m2 = WESTERN_CLAUSE_PATTERN.matcher(query);
        while (m2.find()) refs.add(m2.group(1));
        return refs;
    }

    private RetrievalPlan.QueryType mapQueryType(String raw) {
        if (raw == null) return RetrievalPlan.QueryType.OTHER;
        return switch (raw.toUpperCase()) {
            case "POLICY_QA" -> RetrievalPlan.QueryType.POLICY_QA;
            case "DOC_SEARCH" -> RetrievalPlan.QueryType.DOC_SEARCH;
            case "DEFINITION" -> RetrievalPlan.QueryType.DEFINITION;
            case "PROCEDURE" -> RetrievalPlan.QueryType.PROCEDURE;
            case "CHITCHAT" -> RetrievalPlan.QueryType.CHITCHAT;
            default -> RetrievalPlan.QueryType.OTHER;
        };
    }

    private Set<RetrievalPlan.ChannelId> defaultChannelsFor(
            RetrievalPlan.QueryType qt, boolean hasClauseRefs) {
        EnumSet<RetrievalPlan.ChannelId> ch = EnumSet.of(
                RetrievalPlan.ChannelId.DENSE,
                RetrievalPlan.ChannelId.SPARSE);
        if (hasClauseRefs) ch.add(RetrievalPlan.ChannelId.STRUCTURED);
        if (qt != RetrievalPlan.QueryType.OTHER) {
            ch.add(RetrievalPlan.ChannelId.FAQ);
        }
        return ch;
    }
}

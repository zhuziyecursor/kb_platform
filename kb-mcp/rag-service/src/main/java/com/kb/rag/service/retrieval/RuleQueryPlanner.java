package com.kb.rag.service.retrieval;

import com.kb.rag.service.KeywordFallbackService;
import com.kb.rag.service.SessionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Rule-based QueryPlanner fallback. Used when the LLM planner fails or is disabled.
 *
 * Heuristics:
 * - Extracts clause refs using the same patterns as KeywordFallbackService
 * - Classifies queryType from simple pattern matching
 * - Defaults to {DENSE, SPARSE, FAQ} channels
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RuleQueryPlanner implements QueryPlanner {

    private static final Pattern CLAUSE_PATTERN = Pattern.compile(
            "[第][\\d一二三四五六七八九十百千]+([.．、][\\d一二三四五六七八九十]+)*[条章节]");

    private static final Pattern WESTERN_CLAUSE_PATTERN = Pattern.compile(
            "\\b(\\d+(?:\\.\\d+){1,3})\\s*[条节章]?");

    private static final Pattern HOW_TO_PATTERN = Pattern.compile(
            "如何|怎么|怎样|流程|步骤|办法|做法|途径");

    private static final Pattern DEFINITION_PATTERN = Pattern.compile(
            "什么是|是什么|含义|定义|是指|什么叫|什么叫作");

    @Override
    public RetrievalPlan plan(String tenantId, String rawQuery,
                              List<SessionService.Turn> history) {
        String rewritten = KeywordFallbackService.enhanceQueryStatic(rawQuery);

        Set<String> clauseRefs = new LinkedHashSet<>();
        Matcher m1 = CLAUSE_PATTERN.matcher(rawQuery);
        while (m1.find()) clauseRefs.add(m1.group());
        Matcher m2 = WESTERN_CLAUSE_PATTERN.matcher(rawQuery);
        while (m2.find()) clauseRefs.add(m2.group(1));

        RetrievalPlan.QueryType queryType;
        if (HOW_TO_PATTERN.matcher(rawQuery).find()) {
            queryType = RetrievalPlan.QueryType.PROCEDURE;
        } else if (DEFINITION_PATTERN.matcher(rawQuery).find()) {
            queryType = RetrievalPlan.QueryType.DEFINITION;
        } else if (!clauseRefs.isEmpty()) {
            queryType = RetrievalPlan.QueryType.POLICY_QA;
        } else {
            queryType = RetrievalPlan.QueryType.OTHER;
        }

        Set<RetrievalPlan.ChannelId> channels = EnumSet.of(
                RetrievalPlan.ChannelId.DENSE,
                RetrievalPlan.ChannelId.SPARSE,
                RetrievalPlan.ChannelId.FAQ);
        if (!clauseRefs.isEmpty()) {
            channels.add(RetrievalPlan.ChannelId.STRUCTURED);
        }

        return new RetrievalPlan(
                null, tenantId, rawQuery, rewritten,
                List.of(rewritten), List.of(), clauseRefs,
                List.of(), null, queryType,
                RetrievalPlan.RouteDecision.FULL_RAG, channels);
    }
}

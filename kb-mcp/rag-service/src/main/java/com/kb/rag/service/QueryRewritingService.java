package com.kb.rag.service;

import com.kb.rag.dto.LlmRewriteResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class QueryRewritingService {

    private final LlmQueryRewriteService llmRewriteService;

    private static final Map<String, List<String>> SYNONYMS = new LinkedHashMap<>();
    private static final Pattern PRONOUN_PATTERN = Pattern.compile(
            "^(那|那么|这个|那个|这些|那些|上述|以上|前面|刚才|刚刚)");

    static {
        SYNONYMS.put("审批", List.of("批准", "审核", "核准", "批复"));
        SYNONYMS.put("流程", List.of("过程", "步骤", "环节", "程序"));
        SYNONYMS.put("采购", List.of("购买", "购置", "采办", "供货"));
        SYNONYMS.put("合同", List.of("协议", "合约"));
        SYNONYMS.put("制度", List.of("规定", "规章", "条例", "办法"));
        SYNONYMS.put("报销", List.of("报账", "核销"));
        SYNONYMS.put("预算", List.of("经费", "资金"));
        SYNONYMS.put("合规", List.of("合法", "合乎规定"));
        SYNONYMS.put("风险管理", List.of("风险控制", "风控"));
        SYNONYMS.put("绩效考核", List.of("KPI", "业绩考核", "考评"));
    }

    /**
     * Rewrite query with LLM when appropriate, falling back to synonym expansion.
     *
     * @param query   raw user query
     * @param history recent session turns (max 3 used)
     * @return rewrite result with intent and enriched query
     */
    public RewriteResult rewrite(String query, List<SessionService.Turn> history) {
        // Try LLM rewrite first
        LlmRewriteResponse llmResult = llmRewriteService.rewrite(query, history);
        if (llmResult != null) {
            String enriched = KeywordFallbackService.enhanceQueryStatic(llmResult.getMainQuery());
            return new RewriteResult(
                    enriched,
                    llmResult.getMainQuery(),
                    llmResult.getSubQueries(),
                    llmResult.getKeywords(),
                    llmResult.getIntent()
            );
        }

        // Fallback: synonym expansion + keyword enhancement
        String expanded = synonymExpand(query);
        String enriched = KeywordFallbackService.enhanceQueryStatic(expanded);
        return new RewriteResult(enriched, query, List.of(), List.of(), null);
    }

    /**
     * Legacy rewrite: simple synonym expansion, no LLM.
     */
    public String rewrite(String query) {
        return synonymExpand(query);
    }

    private String synonymExpand(String query) {
        StringBuilder expanded = new StringBuilder(query);
        for (Map.Entry<String, List<String>> entry : SYNONYMS.entrySet()) {
            if (query.contains(entry.getKey())) {
                for (String syn : entry.getValue()) {
                    expanded.append(" ").append(syn);
                }
            }
        }
        return expanded.toString();
    }

    /**
     * Resolve pronoun references using previous query context.
     * PHASE2: LLM-based context-aware query rewriting.
     */
    public String resolveContext(String query, String previousQuery, String previousAnswer) {
        Matcher m = PRONOUN_PATTERN.matcher(query.trim());
        if (!m.find()) {
            return query;
        }

        if (previousQuery == null || previousQuery.isEmpty()) {
            return query;
        }

        String keywords = extractKeywords(previousQuery);
        if (!keywords.isEmpty()) {
            return keywords + " " + query.replaceFirst(m.group(1), "").trim();
        }
        return query;
    }

    private String extractKeywords(String text) {
        List<String> found = new ArrayList<>();
        for (String key : SYNONYMS.keySet()) {
            if (text.contains(key)) {
                found.add(key);
            }
        }
        return String.join(" ", found);
    }

    public record RewriteResult(
            String rewrittenQuery,
            String mainQuery,
            List<String> subQueries,
            List<String> keywords,
            String intent
    ) {
        public boolean hasIntent() {
            return intent != null && !intent.isEmpty();
        }
    }
}

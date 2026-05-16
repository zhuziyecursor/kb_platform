package com.kb.rag.service;

import com.kb.rag.dto.Bm25SearchResult;
import com.kb.rag.repository.SearchIndexRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * BM25 关键词检索服务（PostgreSQL tsvector 原型）。
 *
 * 对条款编号、专有名词、精确数值敏感召回，弥补 Dense 向量的泛化损耗。
 * Phase 2 原型：使用 PG 全文检索；Phase 3 可升级为 OpenSearch/ES。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class Bm25SearchService {

    private final SearchIndexRepository searchIndexRepository;

    @Value("${app.bm25.enabled:true}")
    private boolean enabled;

    @Value("${app.bm25.top-k:50}")
    private int topK;

    private static final Pattern ALPHANUM_PATTERN = Pattern.compile("[a-zA-Z0-9\\d]");

    /**
     * Strict variant: propagates errors so callers (e.g. ChannelExecutor) can
     * mark SPARSE as DEGRADED. Use {@link #searchSafe} for legacy fail-open.
     */
    public List<Bm25SearchResult> search(String query, String tenantId) {
        if (!enabled || query == null || query.trim().isEmpty()) {
            return Collections.emptyList();
        }

        String searchQuery = preprocessQuery(query);
        List<Object[]> rows = searchIndexRepository.searchByTsQuery(searchQuery, tenantId, topK);
        if (rows.isEmpty()) {
            rows = fallbackSearch(query, tenantId);
        }

        List<Bm25SearchResult> results = new ArrayList<>();
        for (Object[] row : rows) {
            results.add(Bm25SearchResult.builder()
                    .docId((String) row[0])
                    .version(row[1] instanceof Number ? ((Number) row[1]).intValue() : 0)
                    .chunkSeq(row[2] instanceof Number ? ((Number) row[2]).intValue() : 0)
                    .title((String) row[3])
                    .textSnippet((String) row[4])
                    .bm25Score(row[5] instanceof Number ? ((Number) row[5]).doubleValue() : 0.0)
                    .secLevel(row.length > 6 && row[6] instanceof Number ? ((Number) row[6]).intValue() : 1)
                    .permGroupId(row.length > 7 && row[7] instanceof Number ? ((Number) row[7]).longValue() : 0L)
                    .effectiveTo(row.length > 8 ? (String) row[8] : null)
                    .regionCode(row.length > 9 ? (String) row[9] : "CN-NATIONAL")
                    .build());
        }

        log.debug("BM25 search: query='{}' -> {} results", query, results.size());
        return results;
    }

    /**
     * Fail-open variant for the legacy retrieval path which expects an empty
     * list on infra failure rather than a thrown exception.
     */
    public List<Bm25SearchResult> searchSafe(String query, String tenantId) {
        try {
            return search(query, tenantId);
        } catch (Exception e) {
            log.warn("BM25 search failed, returning empty: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Preprocess query for tsquery: strip special chars, keep meaningful tokens.
     */
    private String preprocessQuery(String query) {
        // Normalize: replace Chinese punctuation with spaces
        return query.replaceAll("[，。；：、！？（）《》【】\"'']", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    /**
     * Fallback ILIKE search extracting significant terms.
     */
    private List<Object[]> fallbackSearch(String query, String tenantId) {
        // Extract the longest alphanumeric or Chinese segment as search term
        String[] parts = query.split("\\s+");
        String bestTerm = query; // default to full query
        int bestLen = 0;
        for (String part : parts) {
            if (part.length() > bestLen && part.length() >= 2) {
                bestTerm = part;
                bestLen = part.length();
            }
        }
        return searchIndexRepository.searchByILike(bestTerm, tenantId, topK);
    }
}

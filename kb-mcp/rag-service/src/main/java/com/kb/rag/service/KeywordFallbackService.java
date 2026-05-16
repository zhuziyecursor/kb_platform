package com.kb.rag.service;

import com.kb.rag.repository.KnowledgeStructuredRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class KeywordFallbackService {

    private final KnowledgeStructuredRepository knowledgeStructuredRepository;

    private static final Pattern CLAUSE_PATTERN = Pattern.compile(
            "第[\\d一二三四五六七八九十百千]+([.．、][\\d一二三四五六七八九十]+)*[条章节]");

    private static final Pattern WESTERN_CLAUSE_PATTERN = Pattern.compile(
            "\\b(\\d+(?:\\.\\d+){1,3})\\s*[条节章]?");

    /**
     * Clause fast path result: if matched, skip vector search and use these hits.
     */
    public record ClauseMatch(
            boolean matched,
            List<ClauseHit> hits
    ) {
        public static ClauseMatch none() {
            return new ClauseMatch(false, List.of());
        }
    }

    public record ClauseHit(
            String docId,
            int version,
            String sectionPath,
            String title,
            int secLevel,
            long permGroupId,
            String effectiveTo,
            String regionCode
    ) {}

    public String enhanceQuery(String query) {
        return enhanceQueryStatic(query);
    }

    public static String enhanceQueryStatic(String query) {
        StringBuilder keywords = new StringBuilder();

        var matcher = CLAUSE_PATTERN.matcher(query);
        while (matcher.find()) {
            String clause = matcher.group();
            keywords.append(" \"").append(clause).append("\"");
        }

        if (keywords.length() > 0) {
            return query + " " + keywords.toString().trim();
        }
        return query;
    }

    /**
     * A.3 Clause Fast Path: extract clause numbers and try exact match against
     * knowledge_structured.json_body.
     * <p>
     * When a user asks "第32条规定了什么", we extract the clause reference and
     * look up documents whose section_path matches. If found, we can bypass
     * the expensive vector search.
     *
     * @param query    user query
     * @param tenantId tenant ID
     * @return matched docs or empty if no clause detected / no match found
     */
    public ClauseMatch matchClause(String query, String tenantId) {
        if (query == null || query.trim().isEmpty()) {
            return ClauseMatch.none();
        }

        Set<String> clauseRefs = new LinkedHashSet<>();

        // Extract Chinese clause references
        Matcher m1 = CLAUSE_PATTERN.matcher(query);
        while (m1.find()) {
            clauseRefs.add(m1.group());
        }

        // Extract Western-style clause references (e.g., "3.2.1", "3.2 条")
        Matcher m2 = WESTERN_CLAUSE_PATTERN.matcher(query);
        while (m2.find()) {
            clauseRefs.add(m2.group(1));
        }

        if (clauseRefs.isEmpty()) {
            return ClauseMatch.none();
        }

        log.debug("Clause references extracted: {}", clauseRefs);

        List<ClauseHit> hits = new ArrayList<>();
        for (String clauseRef : clauseRefs) {
            try {
                List<Object[]> rows;
                // Try ACL view first, fallback to base table
                try {
                    rows = knowledgeStructuredRepository.findBySectionPathWithAcl(
                            tenantId, clauseRef, 5);
                } catch (Exception e) {
                    log.debug("ACL view unavailable, falling back to base table: {}", e.getMessage());
                    rows = knowledgeStructuredRepository.findBySectionPath(
                            tenantId, clauseRef, 5);
                }
                for (Object[] row : rows) {
                    String docId = (String) row[0];
                    int version = row[1] instanceof Number ? ((Number) row[1]).intValue() : 0;
                    String jsonBody = (String) row[2];
                    String title = extractTitleFromJson(jsonBody);
                    int secLevel = row.length > 3 && row[3] instanceof Number ? ((Number) row[3]).intValue() : 1;
                    long permGroupId = row.length > 5 ? 0L : 0L; // perm_group_id not in structured view
                    String effectiveTo = row.length > 5 ? (String) row[5] : "";
                    String regionCode = row.length > 4 ? (String) row[4] : "CN-NATIONAL";
                    hits.add(new ClauseHit(docId, version, clauseRef, title,
                            secLevel, permGroupId, effectiveTo, regionCode));
                }
            } catch (Exception e) {
                log.warn("Clause fast path lookup failed for '{}': {}", clauseRef, e.getMessage());
            }
        }

        if (!hits.isEmpty()) {
            log.info("Clause fast path hit: query='{}' clauses={} docs={}",
                    query, clauseRefs, hits.size());
            return new ClauseMatch(true, hits);
        }

        return ClauseMatch.none();
    }

    private String extractTitleFromJson(String jsonBody) {
        if (jsonBody == null) return "";
        try {
            // Simple extraction: try to find a "title" key near the beginning
            int titleIdx = jsonBody.indexOf("\"title\"");
            if (titleIdx >= 0) {
                int colonIdx = jsonBody.indexOf(":", titleIdx);
                if (colonIdx >= 0) {
                    int startQuote = jsonBody.indexOf("\"", colonIdx + 1);
                    if (startQuote >= 0) {
                        int endQuote = jsonBody.indexOf("\"", startQuote + 1);
                        if (endQuote >= 0) {
                            return jsonBody.substring(startQuote + 1, endQuote);
                        }
                    }
                }
            }
        } catch (Exception e) {
            // Ignore parse errors for title extraction
        }
        return "";
    }
}

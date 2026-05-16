package com.kb.rag.service;

import com.kb.rag.dto.MilvusSearchResult;
import io.milvus.client.MilvusServiceClient;
import io.milvus.grpc.SearchResults;
import io.milvus.param.MetricType;
import io.milvus.param.R;
import io.milvus.param.collection.LoadCollectionParam;
import io.milvus.param.dml.QueryParam;
import io.milvus.param.dml.SearchParam;
import io.milvus.grpc.QueryResults;
import io.milvus.response.QueryResultsWrapper;
import io.milvus.response.QueryResultsWrapper.RowRecord;
import io.milvus.response.SearchResultsWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class MilvusSearchService {

    private final MilvusServiceClient milvusClient;

    @Value("${app.milvus.collection-name}")
    private String collectionName;

    private static final List<String> OUTPUT_FIELDS = List.of(
            "doc_id", "version", "chunk_seq", "text", "title",
            "section_path", "page", "sec_level", "region_code", "biz_domain",
            "perm_group_id", "effective_from", "effective_to",
            "tags", "chunk_type", "parent_ref"
    );

    private static final java.util.Map<String, Double> CHUNK_TYPE_BOOST = java.util.Map.of(
            "definition", 0.05,
            "rule", 0.03,
            "procedure", 0.01,
            "example", 0.00,
            "disclaimer", -0.03
    );

    public List<MilvusSearchResult> search(List<Float> queryVector, String tenantId,
                                            int userSecLevel, List<Long> permGroupIds,
                                            int topK) {
        String filter = buildAclFilter(tenantId, userSecLevel, permGroupIds);
        log.debug("Milvus search filter: {}", filter);

        LoadCollectionParam loadParam = LoadCollectionParam.newBuilder()
                .withCollectionName(collectionName)
                .build();
        milvusClient.loadCollection(loadParam);

        List<Float> vectorFloats = queryVector.stream().map(Number::floatValue).toList();

        SearchParam searchParam = SearchParam.newBuilder()
                .withCollectionName(collectionName)
                .withMetricType(MetricType.COSINE)
                .withOutFields(OUTPUT_FIELDS)
                .withTopK(topK)
                .withVectors(List.of(vectorFloats))
                .withVectorFieldName("vector")
                .withExpr(filter)
                .withConsistencyLevel(io.milvus.common.clientenum.ConsistencyLevelEnum.EVENTUALLY)
                .build();

        R<SearchResults> response = milvusClient.search(searchParam);
        if (response.getStatus() != 0 || response.getData() == null) {
            log.error("Milvus search failed: {}", response.getMessage());
            return Collections.emptyList();
        }

        SearchResultsWrapper wrapper = new SearchResultsWrapper(
                response.getData().getResults());

        List<RowRecord> rows = wrapper.getRowRecords();
        List<SearchResultsWrapper.IDScore> allIdScores = wrapper.getIDScore(0);
        List<MilvusSearchResult> results = new ArrayList<>();

        for (int i = 0; i < rows.size(); i++) {
            RowRecord row = rows.get(i);

            float score = (allIdScores != null && allIdScores.size() > i)
                    ? allIdScores.get(i).getScore() : 0;

            MilvusSearchResult result = MilvusSearchResult.builder()
                    .id(getLongField(row, "id"))
                    .docId(getStrField(row, "doc_id"))
                    .version(getIntField(row, "version"))
                    .chunkSeq(getIntField(row, "chunk_seq"))
                    .text(getStrField(row, "text"))
                    .title(getStrField(row, "title"))
                    .sectionPath(getStrField(row, "section_path"))
                    .page(getIntField(row, "page"))
                    .secLevel(getIntField(row, "sec_level"))
                    .regionCode(getStrField(row, "region_code"))
                    .bizDomain(getStrField(row, "biz_domain"))
                    .permGroupId(getLongField(row, "perm_group_id"))
                    .effectiveFrom(getStrField(row, "effective_from"))
                    .effectiveTo(getStrField(row, "effective_to"))
                    .tags(getStrField(row, "tags"))
                    .chunkType(getStrField(row, "chunk_type"))
                    .parentRef(getStrField(row, "parent_ref"))
                    .vectorScore(score)
                    .build();
            results.add(result);
        }
        return results;
    }

    private String getStrField(RowRecord row, String field) {
        try {
            Object val = row.get(field);
            return val != null ? String.valueOf(val) : "";
        } catch (Exception e) {
            return "";
        }
    }

    private int getIntField(RowRecord row, String field) {
        try {
            Object val = row.get(field);
            if (val instanceof Number) return ((Number) val).intValue();
            return val != null ? Integer.parseInt(String.valueOf(val)) : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private long getLongField(RowRecord row, String field) {
        try {
            Object val = row.get(field);
            if (val instanceof Number) return ((Number) val).longValue();
            return val != null ? Long.parseLong(String.valueOf(val)) : 0L;
        } catch (Exception e) {
            return 0L;
        }
    }

    /**
     * Build Milvus filter expression.
     * MVP workaround: Milvus 2.4.17 standalone has a bug where AND expressions
     * combining different index types fail with "invalid parameter".
     * We use tenant_id-only filter here and apply the remaining ACL checks
     * via {@link #filterByAcl} in post-processing.
     */
    private String buildAclFilter(String tenantId, int userSecLevel, List<Long> permGroupIds) {
        return "tenant_id == '" + tenantId + "'";
    }

    /**
     * Post-filter Milvus results by ACL fields (sec_level, perm_group_id, effective_to).
     * This compensates for the Milvus 2.4.17 AND-expression parsing bug.
     */
    public List<MilvusSearchResult> filterByAcl(List<MilvusSearchResult> results,
                                                  int userSecLevel,
                                                  List<Long> permGroupIds) {
        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        List<MilvusSearchResult> filtered = new ArrayList<>();
        for (MilvusSearchResult r : results) {
            if (r.getSecLevel() > userSecLevel) {
                log.debug("ACL filtered (sec_level): docId={} secLevel={} > userSecLevel={}",
                        r.getDocId(), r.getSecLevel(), userSecLevel);
                continue;
            }
            if (!permGroupIds.contains(r.getPermGroupId())) {
                log.debug("ACL filtered (perm_group): docId={} permGroupId={} not in {}",
                        r.getDocId(), r.getPermGroupId(), permGroupIds);
                continue;
            }
            String effectiveTo = r.getEffectiveTo();
            if (effectiveTo != null && !effectiveTo.isEmpty() && effectiveTo.compareTo(today) <= 0) {
                log.debug("ACL filtered (expired): docId={} effectiveTo={}", r.getDocId(), effectiveTo);
                continue;
            }
            filtered.add(r);
        }
        log.debug("ACL post-filter: {} -> {} results", results.size(), filtered.size());
        return filtered;
    }

    /**
     * Query Milvus by parent_ref to get Parent chunk texts.
     * Uses a single batch query with IN expression instead of N individual queries.
     *
     * @param parentRefs Set of parent_ref values (format: "docId/version/parentSeq")
     * @param tenantId Tenant ID for ACL filter
     * @return Map of parent_ref -> Parent chunk text (empty if not found)
     */
    public Map<String, String> queryParentTexts(Set<String> parentRefs, String tenantId) {
        if (parentRefs == null || parentRefs.isEmpty()) {
            return Collections.emptyMap();
        }

        Map<String, String> result = new HashMap<>();

        LoadCollectionParam loadParam = LoadCollectionParam.newBuilder()
                .withCollectionName(collectionName)
                .build();
        milvusClient.loadCollection(loadParam);

        String inExpr = parentRefs.stream()
                .map(ref -> "'" + ref + "'")
                .collect(java.util.stream.Collectors.joining(", ", "parent_ref in [", "]"));
        String expr = "tenant_id == '" + tenantId + "' AND " + inExpr;

        try {
            QueryParam queryParam = QueryParam.newBuilder()
                    .withCollectionName(collectionName)
                    .withExpr(expr)
                    .withOutFields(List.of("parent_ref", "text"))
                    .build();

            R<QueryResults> response = milvusClient.query(queryParam);
            if (response.getStatus() == 0 && response.getData() != null) {
                QueryResultsWrapper wrapper = new QueryResultsWrapper(response.getData());
                for (RowRecord row : wrapper.getRowRecords()) {
                    String pref = getStrField(row, "parent_ref");
                    String text = getStrField(row, "text");
                    if (!pref.isEmpty()) {
                        result.put(pref, text);
                    }
                }
            } else {
                log.warn("Parent batch query failed: status={} msg={}", response.getStatus(), response.getMessage());
            }
        } catch (Exception e) {
            log.warn("Parent batch query failed, falling back to individual queries: {}", e.getMessage());
            return queryParentTextsIndividually(parentRefs, tenantId);
        }

        log.debug("Parent lookup: {} refs -> {} texts found (single batch query)", parentRefs.size(), result.size());
        return result;
    }

    private Map<String, String> queryParentTextsIndividually(Set<String> parentRefs, String tenantId) {
        Map<String, String> result = new HashMap<>();
        for (String pref : parentRefs) {
            try {
                QueryParam queryParam = QueryParam.newBuilder()
                        .withCollectionName(collectionName)
                        .withExpr("tenant_id == '" + tenantId + "' AND parent_ref == '" + pref + "'")
                        .withOutFields(List.of("parent_ref", "text"))
                        .build();

                R<QueryResults> response = milvusClient.query(queryParam);
                if (response.getStatus() == 0 && response.getData() != null) {
                    QueryResultsWrapper wrapper = new QueryResultsWrapper(response.getData());
                    List<RowRecord> rows = wrapper.getRowRecords();
                    if (!rows.isEmpty()) {
                        RowRecord row = rows.get(0);
                        result.put(pref, getStrField(row, "text"));
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to query parent_ref={}: {}", pref, e.getMessage());
            }
        }
        return result;
    }

    public List<MilvusSearchResult> boostByChunkType(List<MilvusSearchResult> results) {
        for (MilvusSearchResult r : results) {
            double boost = CHUNK_TYPE_BOOST.getOrDefault(r.getChunkType(), 0.0);
            r.setVectorScore(r.getVectorScore() + boost);
        }
        return results;
    }
}

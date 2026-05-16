package com.kb.vector.service;

import com.kb.vector.repository.KnowledgeSearchIdxRepository;
import io.milvus.client.MilvusServiceClient;
import io.milvus.grpc.QueryResults;
import io.milvus.param.R;
import io.milvus.param.collection.LoadCollectionParam;
import io.milvus.param.dml.QueryParam;
import io.milvus.response.QueryResultsWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Queries PG (knowledge_search_idx) and Milvus for chunk inventory,
 * returning sets of chunk keys for reconciliation.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MilvusInventoryService {

    private final KnowledgeSearchIdxRepository searchIdxRepository;
    private final MilvusServiceClient milvusClient;

    @Value("${milvus.collection-name}")
    private String collectionName;

    private static final int PAGE_SIZE = 1000;

    public List<String> getDistinctTenantIds() {
        return searchIdxRepository.findDistinctTenantIds();
    }

    public long countPgChunks(String tenantId) {
        return searchIdxRepository.countByTenantId(tenantId);
    }

    public long countMilvusChunks(String tenantId) {
        try {
            LoadCollectionParam loadParam = LoadCollectionParam.newBuilder()
                    .withCollectionName(collectionName)
                    .build();
            milvusClient.loadCollection(loadParam);

            QueryParam queryParam = QueryParam.newBuilder()
                    .withCollectionName(collectionName)
                    .withExpr("tenant_id == '" + tenantId + "'")
                    .withOutFields(List.of("doc_id"))
                    .withLimit(1L)
                    .build();

            R<QueryResults> response = milvusClient.query(queryParam);
            // Milvus query doesn't return total count; use iterative approach
            // For accurate count, iterate through all results
            return countMilvusChunksIterative(tenantId);
        } catch (Exception e) {
            log.warn("Failed to count Milvus chunks for tenant {}: {}", tenantId, e.getMessage());
            return -1L;
        }
    }

    private long countMilvusChunksIterative(String tenantId) {
        long count = 0;
        long offset = 0;
        while (true) {
            try {
                QueryParam queryParam = QueryParam.newBuilder()
                        .withCollectionName(collectionName)
                        .withExpr("tenant_id == '" + tenantId + "'")
                        .withOutFields(List.of("doc_id"))
                        .withLimit((long) PAGE_SIZE)
                        .withOffset(offset)
                        .build();

                R<QueryResults> response = milvusClient.query(queryParam);
                if (response.getStatus() != 0 || response.getData() == null) {
                    break;
                }

                QueryResultsWrapper wrapper = new QueryResultsWrapper(response.getData());
                int rowCount = wrapper.getRowRecords().size();
                count += rowCount;
                if (rowCount < PAGE_SIZE) break;
                offset += PAGE_SIZE;
            } catch (Exception e) {
                log.warn("Milvus count pagination error at offset {}: {}", offset, e.getMessage());
                break;
            }
        }
        return count;
    }

    /**
     * Returns set of chunk keys (docId|version|chunkSeq) from PG for a tenant.
     */
    public Set<String> getPgChunkKeys(String tenantId) {
        Set<String> keys = new LinkedHashSet<>();
        int offset = 0;
        while (true) {
            List<Object[]> rows = searchIdxRepository.findChunkKeysByTenantId(tenantId, PAGE_SIZE, offset);
            if (rows.isEmpty()) break;
            for (Object[] row : rows) {
                String docId = (String) row[0];
                int version = row[1] instanceof Number ? ((Number) row[1]).intValue() : 0;
                int chunkSeq = row[2] instanceof Number ? ((Number) row[2]).intValue() : 0;
                keys.add(buildKey(docId, version, chunkSeq));
            }
            if (rows.size() < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }
        return keys;
    }

    /**
     * Returns set of chunk keys (docId|version|chunkSeq) from Milvus for a tenant.
     */
    public Set<String> getMilvusChunkKeys(String tenantId) {
        Set<String> keys = new LinkedHashSet<>();
        try {
            LoadCollectionParam loadParam = LoadCollectionParam.newBuilder()
                    .withCollectionName(collectionName)
                    .build();
            milvusClient.loadCollection(loadParam);
        } catch (Exception e) {
            log.warn("Failed to load Milvus collection: {}", e.getMessage());
            return keys;
        }

        long offset = 0;
        while (true) {
            try {
                QueryParam queryParam = QueryParam.newBuilder()
                        .withCollectionName(collectionName)
                        .withExpr("tenant_id == '" + tenantId + "'")
                        .withOutFields(List.of("doc_id", "version", "chunk_seq"))
                        .withLimit((long) PAGE_SIZE)
                        .withOffset(offset)
                        .build();

                R<QueryResults> response = milvusClient.query(queryParam);
                if (response.getStatus() != 0 || response.getData() == null) {
                    break;
                }

                QueryResultsWrapper wrapper = new QueryResultsWrapper(response.getData());
                List<QueryResultsWrapper.RowRecord> rows = wrapper.getRowRecords();
                for (QueryResultsWrapper.RowRecord row : rows) {
                    try {
                        String docId = getStrField(row, "doc_id");
                        int version = getIntField(row, "version");
                        int chunkSeq = getIntField(row, "chunk_seq");
                        keys.add(buildKey(docId, version, chunkSeq));
                    } catch (Exception e) {
                        log.debug("Skip unparseable Milvus row: {}", e.getMessage());
                    }
                }
                if (rows.size() < PAGE_SIZE) break;
                offset += PAGE_SIZE;
            } catch (Exception e) {
                log.warn("Milvus pagination error at offset {} for tenant {}: {}",
                        offset, tenantId, e.getMessage());
                break;
            }
        }
        return keys;
    }

    static String buildKey(String docId, int version, int chunkSeq) {
        return docId + "|" + version + "|" + chunkSeq;
    }

    private String getStrField(QueryResultsWrapper.RowRecord row, String field) {
        try {
            Object val = row.get(field);
            return val != null ? String.valueOf(val) : "";
        } catch (Exception e) {
            return "";
        }
    }

    private int getIntField(QueryResultsWrapper.RowRecord row, String field) {
        try {
            Object val = row.get(field);
            if (val instanceof Number) return ((Number) val).intValue();
            return val != null ? Integer.parseInt(String.valueOf(val)) : 0;
        } catch (Exception e) {
            return 0;
        }
    }
}

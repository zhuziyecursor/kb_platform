package com.kb.rag.repository;

import com.kb.rag.entity.KnowledgeSearchIdx;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SearchIndexRepository extends JpaRepository<KnowledgeSearchIdx, Long> {

    /**
     * BM25 关键词检索：ts_rank_cd 计算 cover-density 排名，再按 doc_length 归一抑制
     * 长文档的天然得分优势。归一系数：1 + ln(max(doc_length, 1) / 500)。
     */
    @Query(value = """
            SELECT k.doc_id, k.version, k.chunk_seq, k.title, k.text_snippet,
                   ts_rank_cd(k.tokens, plainto_tsquery('simple', :query))
                     / (1 + ln(GREATEST(LENGTH(k.text_snippet), 1) / 500.0)) AS score,
                   k.sec_level, k.perm_group_id, k.effective_to, k.region_code
            FROM kb_knowledge.knowledge_search_idx k
            WHERE k.tenant_id = :tenantId
              AND k.tokens @@ plainto_tsquery('simple', :query)
            ORDER BY score DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> searchByTsQuery(@Param("query") String query,
                                    @Param("tenantId") String tenantId,
                                    @Param("limit") int limit);

    /**
     * Fallback: simple ILIKE search when tsvector index is not available.
     */
    @Query(value = """
            SELECT k.doc_id, k.version, k.chunk_seq, k.title, k.text_snippet,
                   0.1 AS score,
                   k.sec_level, k.perm_group_id, k.effective_to, k.region_code
            FROM kb_knowledge.knowledge_search_idx k
            WHERE k.tenant_id = :tenantId
              AND k.text_snippet ILIKE '%' || :term || '%'
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> searchByILike(@Param("term") String term,
                                  @Param("tenantId") String tenantId,
                                  @Param("limit") int limit);
}

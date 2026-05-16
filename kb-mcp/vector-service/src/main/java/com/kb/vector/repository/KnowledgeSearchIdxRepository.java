package com.kb.vector.repository;

import com.kb.vector.entity.KnowledgeSearchIdx;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface KnowledgeSearchIdxRepository extends JpaRepository<KnowledgeSearchIdx, Long> {

    @Modifying
    @Query(value = """
            INSERT INTO kb_knowledge.knowledge_search_idx
                (tenant_id, doc_id, version, chunk_seq, title, text_snippet, tokens,
                 sec_level, perm_group_id, effective_to, region_code,
                 created_at, updated_at)
            VALUES (:tenantId, :docId, :version, :chunkSeq, :title, :textSnippet,
                    to_tsvector('simple', :tsvectorInput),
                    :secLevel, :permGroupId, CAST(:effectiveTo AS DATE), :regionCode,
                    NOW(), NOW())
            ON CONFLICT (tenant_id, doc_id, version, chunk_seq)
            DO UPDATE SET
                title = EXCLUDED.title,
                text_snippet = EXCLUDED.text_snippet,
                tokens = to_tsvector('simple', EXCLUDED.text_snippet),
                sec_level = EXCLUDED.sec_level,
                perm_group_id = EXCLUDED.perm_group_id,
                effective_to = EXCLUDED.effective_to,
                region_code = EXCLUDED.region_code,
                updated_at = NOW()
            """, nativeQuery = true)
    int upsert(@Param("tenantId") String tenantId,
               @Param("docId") String docId,
               @Param("version") Integer version,
               @Param("chunkSeq") Integer chunkSeq,
               @Param("title") String title,
               @Param("textSnippet") String textSnippet,
               @Param("tsvectorInput") String tsvectorInput,
               @Param("secLevel") Integer secLevel,
               @Param("permGroupId") Long permGroupId,
               @Param("effectiveTo") String effectiveTo,
               @Param("regionCode") String regionCode);

    @Query(value = "SELECT COUNT(*) FROM kb_knowledge.knowledge_search_idx WHERE tenant_id = :tenantId",
            nativeQuery = true)
    long countByTenantId(@Param("tenantId") String tenantId);

    @Query(value = """
            SELECT tenant_id FROM kb_knowledge.knowledge_search_idx
            GROUP BY tenant_id ORDER BY tenant_id
            """, nativeQuery = true)
    List<String> findDistinctTenantIds();

    @Query(value = """
            SELECT doc_id, version, chunk_seq
            FROM kb_knowledge.knowledge_search_idx
            WHERE tenant_id = :tenantId
            ORDER BY doc_id, version, chunk_seq
            LIMIT :limit OFFSET :offset
            """, nativeQuery = true)
    List<Object[]> findChunkKeysByTenantId(@Param("tenantId") String tenantId,
                                           @Param("limit") int limit,
                                           @Param("offset") int offset);
}

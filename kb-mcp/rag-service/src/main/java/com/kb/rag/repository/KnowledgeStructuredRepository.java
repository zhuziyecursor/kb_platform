package com.kb.rag.repository;

import com.kb.rag.entity.KnowledgeStructured;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface KnowledgeStructuredRepository extends JpaRepository<KnowledgeStructured, Long> {

    /**
     * 查找包含指定 section_path 的结构化文档。
     * 用于条款编号 Fast Path：精确匹配章节路径（如 "3/3.2/3.2.1"）。
     */
    @Query(value = """
            SELECT ks.doc_id, ks.version, ks.json_body
            FROM kb_knowledge.knowledge_structured ks
            WHERE ks.tenant_id = :tenantId
              AND ks.json_body::text LIKE '%' || :sectionPath || '%'
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> findBySectionPath(@Param("tenantId") String tenantId,
                                      @Param("sectionPath") String sectionPath,
                                      @Param("limit") int limit);

    @Query(value = """
            SELECT ks.doc_id, ks.version, ks.json_body,
                   ks.sec_level, ks.region_code, ks.effective_to
            FROM kb_knowledge.v_knowledge_structured_acl ks
            WHERE ks.tenant_id = :tenantId
              AND ks.json_body::text LIKE '%' || :sectionPath || '%'
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> findBySectionPathWithAcl(@Param("tenantId") String tenantId,
                                             @Param("sectionPath") String sectionPath,
                                             @Param("limit") int limit);
}

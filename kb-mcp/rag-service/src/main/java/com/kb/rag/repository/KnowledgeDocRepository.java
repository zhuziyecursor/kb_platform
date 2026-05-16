package com.kb.rag.repository;

import com.kb.rag.entity.KnowledgeDoc;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface KnowledgeDocRepository extends JpaRepository<KnowledgeDoc, Long> {

    @Query("SELECT d.docId FROM KnowledgeDoc d WHERE d.tenantId = :tenantId AND d.docId IN :docIds")
    List<String> findDocIdsByTenantIdAndDocIdIn(@Param("tenantId") String tenantId,
                                                 @Param("docIds") List<String> docIds);

    @Query("SELECT DISTINCT d.docId FROM KnowledgeDoc d WHERE d.tenantId = :tenantId AND d.knowledgeSpaceId IN :spaceIds")
    List<String> findDocIdsByTenantIdAndSpaceIdIn(@Param("tenantId") String tenantId,
                                                   @Param("spaceIds") List<String> spaceIds);

    @Query("SELECT d.docId, d.knowledgeSpaceId FROM KnowledgeDoc d WHERE d.tenantId = :tenantId AND d.docId IN :docIds")
    List<Object[]> findDocSpacePairsByTenantIdAndDocIdIn(@Param("tenantId") String tenantId,
                                                          @Param("docIds") List<String> docIds);
}

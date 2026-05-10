package com.kb.rag.repository;

import com.kb.rag.entity.KnowledgeDoc;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface KnowledgeDocRepository extends JpaRepository<KnowledgeDoc, Long> {

    @Query("SELECT d.docId FROM KnowledgeDoc d WHERE d.tenantId = :tenantId AND d.docId IN :docIds")
    List<String> findDocIdsByTenantIdAndDocIdIn(String tenantId, List<String> docIds);

    @Query("SELECT DISTINCT d.docId FROM KnowledgeDoc d WHERE d.tenantId = :tenantId AND d.knowledgeSpaceId IN :spaceIds")
    List<String> findDocIdsByTenantIdAndSpaceIdIn(String tenantId, List<String> spaceIds);

    @Query("SELECT d.docId, d.knowledgeSpaceId FROM KnowledgeDoc d WHERE d.tenantId = :tenantId AND d.docId IN :docIds")
    List<Object[]> findDocSpacePairsByTenantIdAndDocIdIn(String tenantId, List<String> docIds);
}

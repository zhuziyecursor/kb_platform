package com.kb.rag.repository;

import com.kb.rag.entity.KnowledgeVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface KnowledgeVersionRepository extends JpaRepository<KnowledgeVersion, Long> {

    @Query("SELECT v FROM KnowledgeVersion v WHERE v.tenantId = :tenantId AND v.docId IN :docIds ORDER BY v.version DESC")
    List<KnowledgeVersion> findByTenantIdAndDocIdIn(
            @Param("tenantId") String tenantId,
            @Param("docIds") List<String> docIds);

    @Query("SELECT v FROM KnowledgeVersion v WHERE v.tenantId = :tenantId AND v.docId = :docId AND v.status = 'READY'")
    Optional<KnowledgeVersion> findReadyByTenantIdAndDocId(
            @Param("tenantId") String tenantId,
            @Param("docId") String docId);
}

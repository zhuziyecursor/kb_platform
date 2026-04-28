package com.kb.ingest.repository;

import com.kb.ingest.entity.KnowledgeDoc;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface KnowledgeDocRepository extends JpaRepository<KnowledgeDoc, Long> {

    Optional<KnowledgeDoc> findByTenantIdAndDocIdAndVersion(String tenantId, String docId, Integer version);

    List<KnowledgeDoc> findByTenantIdAndDocId(String tenantId, String docId);

    Optional<KnowledgeDoc> findByTenantIdAndSha256(String tenantId, String sha256);

    @Query("SELECT d FROM KnowledgeDoc d WHERE d.tenantId = :tenantId AND d.docId = :docId ORDER BY d.version DESC")
    List<KnowledgeDoc> findVersionsByDocId(@Param("tenantId") String tenantId, @Param("docId") String docId);

    @Modifying
    @Query("UPDATE KnowledgeDoc d SET d.status = :status WHERE d.tenantId = :tenantId AND d.docId = :docId AND d.version = :version")
    int updateStatus(@Param("tenantId") String tenantId, @Param("docId") String docId, @Param("version") Integer version, @Param("status") String status);

    @Modifying
    @Query("UPDATE KnowledgeDoc d SET d.verified = true WHERE d.tenantId = :tenantId AND d.docId = :docId AND d.version = :version")
    int markAsVerified(@Param("tenantId") String tenantId, @Param("docId") String docId, @Param("version") Integer version);

    List<KnowledgeDoc> findByTenantIdOrderByCreateTimeDesc(String tenantId);

    List<KnowledgeDoc> findByTenantIdAndKnowledgeSpaceIdOrderByCreateTimeDesc(String tenantId, String spaceId);
}
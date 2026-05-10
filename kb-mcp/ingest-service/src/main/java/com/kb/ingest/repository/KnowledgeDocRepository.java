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

    Optional<KnowledgeDoc> findByTenantIdAndSha256AndCreateTime(String tenantId, String sha256, java.time.LocalDateTime createTime);

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

    long countByTenantIdAndStatus(String tenantId, String status);

    @Query(value = "SELECT s.id as spaceId, s.name as spaceName, COALESCE(COUNT(d.id), 0) as docCount " +
            "FROM kb_knowledge.knowledge_space s " +
            "LEFT JOIN kb_knowledge.knowledge_doc d ON s.id = d.knowledge_space_id AND d.tenant_id = :tenantId " +
            "WHERE s.tenant_id = :tenantId " +
            "GROUP BY s.id, s.name " +
            "ORDER BY docCount DESC", nativeQuery = true)
    List<Object[]> countDocsPerSpace(@Param("tenantId") String tenantId);

    @Query(value = "SELECT TO_CHAR(d.create_time, 'YYYY-MM-DD') as date, COUNT(*) as count " +
            "FROM kb_knowledge.knowledge_doc d " +
            "WHERE d.tenant_id = :tenantId AND d.create_time >= :sinceDate " +
            "GROUP BY TO_CHAR(d.create_time, 'YYYY-MM-DD') " +
            "ORDER BY date", nativeQuery = true)
    List<Object[]> countDocsByDay(@Param("tenantId") String tenantId, @Param("sinceDate") java.time.LocalDateTime sinceDate);
}
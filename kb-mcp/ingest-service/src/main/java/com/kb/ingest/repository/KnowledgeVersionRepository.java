package com.kb.ingest.repository;

import com.kb.ingest.entity.KnowledgeVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface KnowledgeVersionRepository extends JpaRepository<KnowledgeVersion, Long> {

    Optional<KnowledgeVersion> findByTenantIdAndDocIdAndVersion(String tenantId, String docId, Integer version);

    @Modifying
    @Query("UPDATE KnowledgeVersion v SET v.status = :status WHERE v.tenantId = :tenantId AND v.docId = :docId AND v.version = :version")
    int updateStatus(@Param("tenantId") String tenantId, @Param("docId") String docId, @Param("version") Integer version, @Param("status") String status);

    boolean existsByTenantIdAndDocIdAndVersion(String tenantId, String docId, Integer version);
}
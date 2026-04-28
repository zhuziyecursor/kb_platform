package com.kb.ingest.repository;

import com.kb.ingest.entity.KnowledgeSpace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface KnowledgeSpaceRepository extends JpaRepository<KnowledgeSpace, String> {

    List<KnowledgeSpace> findByTenantId(String tenantId);

    Optional<KnowledgeSpace> findByIdAndTenantId(String id, String tenantId);

    Optional<KnowledgeSpace> findByTenantIdAndName(String tenantId, String name);

    boolean existsByTenantIdAndName(String tenantId, String name);

    @Query(value = "SELECT COUNT(*) FROM kb_knowledge.knowledge_doc WHERE tenant_id = :tenantId AND knowledge_space_id = :spaceId AND status != 'DEPRECATED'", nativeQuery = true)
    Long countDocsInSpace(@Param("tenantId") String tenantId, @Param("spaceId") String spaceId);
}
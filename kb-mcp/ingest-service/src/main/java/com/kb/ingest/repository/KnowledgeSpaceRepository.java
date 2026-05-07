package com.kb.ingest.repository;

import com.kb.ingest.entity.KnowledgeSpace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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

    List<KnowledgeSpace> findByTenantIdAndParentId(String tenantId, String parentId);

    List<KnowledgeSpace> findByTenantIdAndNodePathStartingWith(String tenantId, String nodePath);

    @Query(value = "SELECT COUNT(*) FROM kb_knowledge.knowledge_doc WHERE tenant_id = :tenantId AND knowledge_space_id = :spaceId AND status != 'DEPRECATED'", nativeQuery = true)
    Long countDocsInSpace(@Param("tenantId") String tenantId, @Param("spaceId") String spaceId);

    @Query(value = "SELECT COUNT(*) FROM kb_knowledge.knowledge_doc WHERE knowledge_space_id IN (" +
            "  SELECT id FROM kb_knowledge.knowledge_space" +
            "  WHERE (node_path LIKE CONCAT(:pathPrefix, '%') OR id = :spaceId)" +
            "    AND tenant_id = :tenantId" +
            ") AND status != 'DEPRECATED'", nativeQuery = true)
    Long countDocsInSubtree(@Param("tenantId") String tenantId, @Param("spaceId") String spaceId,
                            @Param("pathPrefix") String pathPrefix);

    @Modifying
    @Query(value = "DELETE FROM kb_knowledge.knowledge_space WHERE tenant_id = :tenantId AND " +
            "(node_path LIKE CONCAT(:pathPrefix, '%') OR id = :spaceId)", nativeQuery = true)
    int deleteSubtree(@Param("tenantId") String tenantId, @Param("spaceId") String spaceId,
                      @Param("pathPrefix") String pathPrefix);
}
package com.kb.rag.repository;

import com.kb.rag.entity.KnowledgeSpace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface KnowledgeSpaceRepository extends JpaRepository<KnowledgeSpace, String> {

    List<KnowledgeSpace> findByTenantIdAndIdIn(String tenantId, List<String> ids);

    @Query("SELECT s FROM KnowledgeSpace s WHERE s.tenantId = :tenantId AND s.nodePath LIKE CONCAT(:nodePath, '%')")
    List<KnowledgeSpace> findSubtreeByTenantIdAndNodePath(String tenantId, String nodePath);

    @Query("SELECT s.id FROM KnowledgeSpace s WHERE s.tenantId = :tenantId AND s.nodePath LIKE CONCAT(:nodePath, '%')")
    List<String> findSubtreeIdsByTenantIdAndNodePath(String tenantId, String nodePath);
}

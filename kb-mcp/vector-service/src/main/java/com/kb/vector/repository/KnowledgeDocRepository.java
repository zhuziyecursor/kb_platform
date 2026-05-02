package com.kb.vector.repository;

import com.kb.vector.entity.KnowledgeDoc;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface KnowledgeDocRepository extends JpaRepository<KnowledgeDoc, Long> {

    @Modifying
    @Query("UPDATE KnowledgeDoc d SET d.status = :status WHERE d.tenantId = :tenantId AND d.docId = :docId AND d.version = :version")
    int updateStatus(@Param("tenantId") String tenantId,
                     @Param("docId") String docId,
                     @Param("version") Integer version,
                     @Param("status") String status);
}

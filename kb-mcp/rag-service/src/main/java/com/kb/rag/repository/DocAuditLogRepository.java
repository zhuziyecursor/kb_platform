package com.kb.rag.repository;

import com.kb.rag.entity.DocAuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DocAuditLogRepository extends JpaRepository<DocAuditLog, Long> {

    @Query("""
        SELECT d FROM DocAuditLog d
        WHERE d.tenantId = :tenantId
          AND (:action IS NULL OR d.action = :action)
          AND (:result IS NULL OR d.result = :result)
        ORDER BY d.ts DESC
    """)
    Page<DocAuditLog> findAuditLogs(@Param("tenantId") String tenantId,
                                     @Param("action") String action,
                                     @Param("result") String result,
                                     Pageable pageable);
}

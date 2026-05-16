package com.kb.rag.repository;

import com.kb.rag.entity.AlertLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AlertLogRepository extends JpaRepository<AlertLog, Long> {

    Page<AlertLog> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    @Query("SELECT a FROM AlertLog a WHERE a.tenantId = :tenantId AND a.resolved = false")
    List<AlertLog> findUnresolved(@Param("tenantId") String tenantId);

    boolean existsByTenantIdAndAlertTypeAndCreatedAtAfter(String tenantId, String alertType, Instant since);
}

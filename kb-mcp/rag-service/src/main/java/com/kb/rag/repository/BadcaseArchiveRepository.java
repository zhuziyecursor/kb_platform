package com.kb.rag.repository;

import com.kb.rag.entity.BadcaseArchive;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface BadcaseArchiveRepository extends JpaRepository<BadcaseArchive, Long> {

    @Query("""
        SELECT b FROM BadcaseArchive b
        WHERE b.tenantId = :tenantId
          AND (:status IS NULL OR b.status = :status)
          AND (:feedbackType IS NULL OR b.feedbackType = :feedbackType)
          AND (:reportReason IS NULL OR b.reportReason = :reportReason)
          AND (:from IS NULL OR b.createdAt >= :from)
          AND (:to IS NULL OR b.createdAt <= :to)
        ORDER BY b.createdAt DESC
    """)
    Page<BadcaseArchive> findBadcases(@Param("tenantId") String tenantId,
                                      @Param("status") String status,
                                      @Param("feedbackType") String feedbackType,
                                      @Param("reportReason") String reportReason,
                                      @Param("from") Instant from,
                                      @Param("to") Instant to,
                                      Pageable pageable);
}

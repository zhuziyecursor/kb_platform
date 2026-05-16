package com.kb.rag.repository;

import com.kb.rag.entity.RagFeedback;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RagFeedbackRepository extends JpaRepository<RagFeedback, Long> {

    Optional<RagFeedback> findByTraceId(String traceId);

    @Query("""
        SELECT f FROM RagFeedback f
        WHERE f.tenantId = :tenantId
          AND (:feedbackType IS NULL OR f.feedbackType = :feedbackType)
          AND f.createdAt >= :from
          AND f.createdAt <= :to
        ORDER BY f.createdAt DESC
    """)
    Page<RagFeedback> findFeedback(@Param("tenantId") String tenantId,
                                    @Param("feedbackType") String feedbackType,
                                    @Param("from") Instant from,
                                    @Param("to") Instant to,
                                    Pageable pageable);

    @Query(value = """
        SELECT COALESCE(COUNT(*) FILTER (WHERE f.feedback_type = 'LIKE'), 0) AS like_count,
               COALESCE(COUNT(*) FILTER (WHERE f.feedback_type = 'DISLIKE'), 0) AS dislike_count,
               COALESCE(COUNT(*) FILTER (WHERE f.feedback_type = 'REPORT'), 0) AS report_count
        FROM kb_audit.rag_feedback f
        WHERE f.tenant_id = :tenantId
          AND f.created_at >= :since
          AND f.created_at <= :until
    """, nativeQuery = true)
    List<Object[]> getFeedbackStats(@Param("tenantId") String tenantId,
                                    @Param("since") Instant since,
                                    @Param("until") Instant until);
}

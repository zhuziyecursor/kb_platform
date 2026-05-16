package com.kb.rag.repository;

import com.kb.rag.dto.RagPipelineTraceSummary;
import com.kb.rag.entity.RagPipelineTrace;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface RagPipelineTraceRepository extends JpaRepository<RagPipelineTrace, Long> {

    Optional<RagPipelineTrace> findByTraceId(String traceId);

    @Query("""
        SELECT new com.kb.rag.dto.RagPipelineTraceSummary(
            t.traceId, t.tenantId, t.uid, t.sessionId,
            t.queryText, t.rewrittenQuery, t.spaceId, t.lang,
            t.cacheHit, t.stream, t.result, t.refusalReason,
            t.totalMs, t.firstTokenMs, t.recallCount, t.aclFilteredCount,
            t.rerankCount, t.citationsCount, t.errorMessage, t.createdAt
        )
        FROM RagPipelineTrace t
        WHERE t.tenantId = :tenantId
          AND (:result IS NULL OR t.result = :result)
          AND t.createdAt >= :from
          AND t.createdAt <= :to
        ORDER BY t.createdAt DESC
    """)
    Page<RagPipelineTraceSummary> findTraceSummaries(@Param("tenantId") String tenantId,
                                                      @Param("result") String result,
                                                      @Param("from") Instant from,
                                                      @Param("to") Instant to,
                                                      Pageable pageable);

    @Query(value = """
        SELECT t.query_text,
               COUNT(*) AS cnt,
               AVG(t.total_ms) AS avg_ms,
               AVG(t.citations_count) AS avg_citations,
               SUM(CASE WHEN t.result = 'REFUSED' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS refusal_rate,
               MAX(t.created_at) AS last_seen
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.query_text IS NOT NULL
        GROUP BY t.query_text
        ORDER BY cnt DESC
        LIMIT :limit
    """, nativeQuery = true)
    List<Object[]> aggregateTopQueries(@Param("tenantId") String tenantId,
                                       @Param("since") Instant since,
                                       @Param("limit") int limit);

    @Query(value = """
        SELECT t.query_text,
               COUNT(*) AS cnt,
               AVG(t.total_ms) AS avg_ms,
               AVG(t.citations_count) AS avg_citations,
               SUM(CASE WHEN t.result = 'REFUSED' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS refusal_rate,
               MAX(t.created_at) AS last_seen
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.space_id = :spaceId
          AND t.query_text IS NOT NULL
        GROUP BY t.query_text
        ORDER BY cnt DESC
        LIMIT :limit
    """, nativeQuery = true)
    List<Object[]> aggregateTopQueries(@Param("tenantId") String tenantId,
                                       @Param("since") Instant since,
                                       @Param("spaceId") String spaceId,
                                       @Param("limit") int limit);

    // ========== Dashboard Metrics Queries ==========

    @Query(value = """
        SELECT COUNT(*) AS total_requests,
               COALESCE(SUM(CASE WHEN t.result = 'SUCCESS' THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0), 0) AS success_rate,
               COALESCE(AVG(t.total_ms), 0) AS avg_response_ms,
               COALESCE(SUM(CASE WHEN t.result = 'REFUSED' THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0), 0) AS refusal_rate
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.created_at <= :until
    """, nativeQuery = true)
    List<Object[]> getDashboardOverallMetrics(@Param("tenantId") String tenantId,
                                             @Param("since") Instant since,
                                             @Param("until") Instant until);

    @Query(value = """
        SELECT TO_CHAR(DATE_TRUNC('hour', t.created_at), 'HH24:MI') AS label,
               COALESCE(SUM(CASE WHEN t.result = 'REFUSED' THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0), 0) AS value,
               COUNT(*) AS count
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.created_at <= :until
        GROUP BY DATE_TRUNC('hour', t.created_at)
        ORDER BY DATE_TRUNC('hour', t.created_at)
    """, nativeQuery = true)
    List<Object[]> getRefusalTrendHourly(@Param("tenantId") String tenantId,
                                         @Param("since") Instant since,
                                         @Param("until") Instant until);

    @Query(value = """
        SELECT TO_CHAR(DATE_TRUNC('day', t.created_at), 'YYYY-MM-DD') AS label,
               COALESCE(SUM(CASE WHEN t.result = 'REFUSED' THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0), 0) AS value,
               COUNT(*) AS count
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.created_at <= :until
        GROUP BY DATE_TRUNC('day', t.created_at)
        ORDER BY DATE_TRUNC('day', t.created_at)
    """, nativeQuery = true)
    List<Object[]> getRefusalTrendDaily(@Param("tenantId") String tenantId,
                                        @Param("since") Instant since,
                                        @Param("until") Instant until);

    @Query(value = """
        SELECT TO_CHAR(DATE_TRUNC('hour', t.created_at), 'HH24:MI') AS label,
               COALESCE(AVG(t.total_ms), 0) AS value,
               COUNT(*) AS count
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.created_at <= :until
        GROUP BY DATE_TRUNC('hour', t.created_at)
        ORDER BY DATE_TRUNC('hour', t.created_at)
    """, nativeQuery = true)
    List<Object[]> getRequestTrendHourly(@Param("tenantId") String tenantId,
                                         @Param("since") Instant since,
                                         @Param("until") Instant until);

    @Query(value = """
        SELECT TO_CHAR(DATE_TRUNC('day', t.created_at), 'YYYY-MM-DD') AS label,
               COALESCE(AVG(t.total_ms), 0) AS value,
               COUNT(*) AS count
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.created_at <= :until
        GROUP BY DATE_TRUNC('day', t.created_at)
        ORDER BY DATE_TRUNC('day', t.created_at)
    """, nativeQuery = true)
    List<Object[]> getRequestTrendDaily(@Param("tenantId") String tenantId,
                                        @Param("since") Instant since,
                                        @Param("until") Instant until);

    @Query(value = """
        SELECT t.query_text,
               AVG(t.total_ms) AS avg_ms,
               COUNT(*) AS cnt,
               PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t.total_ms) AS p95_ms
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.created_at <= :until
          AND t.query_text IS NOT NULL
        GROUP BY t.query_text
        ORDER BY AVG(t.total_ms) DESC
        LIMIT :limit
    """, nativeQuery = true)
    List<Object[]> getTopSlowQueries(@Param("tenantId") String tenantId,
                                     @Param("since") Instant since,
                                     @Param("until") Instant until,
                                     @Param("limit") int limit);

    @Query(value = """
        SELECT LOWER(TRIM(t.query_text)) AS cluster_key,
               MIN(t.query_text) AS representative,
               COUNT(*) AS cnt,
               AVG(t.total_ms) AS avg_ms,
               SUM(CASE WHEN t.result = 'REFUSED' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS refusal_rate,
               AVG(t.citations_count) AS avg_citations
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
          AND t.query_text IS NOT NULL
        GROUP BY LOWER(TRIM(t.query_text))
        HAVING COUNT(*) >= :minCount
        ORDER BY cnt DESC
        LIMIT :limit
    """, nativeQuery = true)
    List<Object[]> getQuestionClusters(@Param("tenantId") String tenantId,
                                       @Param("since") Instant since,
                                       @Param("minCount") int minCount,
                                       @Param("limit") int limit);

    // ========== User Behavior Analytics Queries ==========

    @Query(value = """
        SELECT t.uid,
               COUNT(*) AS query_count,
               COUNT(DISTINCT t.session_id) AS session_count,
               EXTRACT(EPOCH FROM MAX(t.created_at)) * 1000 AS last_active_ms
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
        GROUP BY t.uid
        ORDER BY query_count DESC
        LIMIT :limit
    """, nativeQuery = true)
    List<Object[]> getTopUsers(@Param("tenantId") String tenantId,
                               @Param("since") Instant since,
                               @Param("limit") int limit);

    @Query(value = """
        SELECT COALESCE(t.space_id, '(全库)') AS space_id,
               COUNT(*) AS query_count,
               COUNT(DISTINCT t.uid) AS unique_users,
               AVG(t.total_ms) AS avg_ms
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
        GROUP BY COALESCE(t.space_id, '(全库)')
        ORDER BY query_count DESC
        LIMIT :limit
    """, nativeQuery = true)
    List<Object[]> getSpaceHeatmap(@Param("tenantId") String tenantId,
                                   @Param("since") Instant since,
                                   @Param("limit") int limit);

    @Query(value = """
        SELECT COUNT(DISTINCT t.uid) AS active_users,
               COUNT(DISTINCT t.session_id) AS total_sessions,
               COALESCE(COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT t.uid), 0), 0) AS avg_queries_per_user
        FROM kb_audit.rag_pipeline_trace t
        WHERE t.tenant_id = :tenantId
          AND t.created_at >= :since
    """, nativeQuery = true)
    List<Object[]> getUserBehaviorOverview(@Param("tenantId") String tenantId,
                                          @Param("since") Instant since);
}

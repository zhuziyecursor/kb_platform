package com.kb.rag.repository;

import com.kb.rag.entity.RagPipelineTrace;
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
}

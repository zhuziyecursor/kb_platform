package com.kb.rag.service;

import com.kb.rag.dto.TopQueriesResponse;
import com.kb.rag.repository.RagPipelineTraceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final RagPipelineTraceRepository traceRepository;

    public List<TopQueriesResponse> getTopQueries(String tenantId, int days, int limit, String spaceId) {
        Instant since = Instant.now().minus(days, ChronoUnit.DAYS);
        List<Object[]> rows;
        if (spaceId != null && !spaceId.isEmpty()) {
            rows = traceRepository.aggregateTopQueries(tenantId, since, spaceId, limit);
        } else {
            rows = traceRepository.aggregateTopQueries(tenantId, since, limit);
        }
        return rows.stream().map(this::mapRow).toList();
    }

    private TopQueriesResponse mapRow(Object[] row) {
        return TopQueriesResponse.builder()
                .queryText((String) row[0])
                .count(((Number) row[1]).longValue())
                .avgTotalMs(((Number) row[2]).doubleValue())
                .avgCitations((int) Math.round(((Number) row[3]).doubleValue()))
                .refusalRate(((Number) row[4]).doubleValue())
                .lastSeen(row[5] != null ? ((java.sql.Timestamp) row[5]).toInstant() : null)
                .build();
    }
}

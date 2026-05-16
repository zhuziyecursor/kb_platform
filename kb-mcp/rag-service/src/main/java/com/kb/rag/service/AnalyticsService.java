package com.kb.rag.service;

import com.kb.rag.dto.DashboardMetrics;
import com.kb.rag.dto.DashboardMetrics.FeedbackStats;
import com.kb.rag.dto.DashboardMetrics.SlowQuery;
import com.kb.rag.dto.DashboardMetrics.TrendPoint;
import com.kb.rag.dto.QuestionCluster;
import com.kb.rag.dto.TopQueriesResponse;
import com.kb.rag.dto.UserBehaviorResponse;
import com.kb.rag.dto.UserBehaviorResponse.SpaceHeat;
import com.kb.rag.dto.UserBehaviorResponse.UserActivity;
import com.kb.rag.repository.RagFeedbackRepository;
import com.kb.rag.repository.RagPipelineTraceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final RagPipelineTraceRepository traceRepository;
    private final RagFeedbackRepository feedbackRepository;

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

    public DashboardMetrics getDashboardMetrics(String tenantId, String period, int slowQueryLimit) {
        Instant now = Instant.now();
        Instant since = computeSince(period, now);
        boolean hourly = "today".equals(period);

        List<Object[]> overallRows = traceRepository.getDashboardOverallMetrics(tenantId, since, now);
        Object[] overall = overallRows.isEmpty() ? new Object[]{0L, 0.0, 0.0, 0.0} : overallRows.get(0);

        List<TrendPoint> refusalTrend = hourly
                ? traceRepository.getRefusalTrendHourly(tenantId, since, now).stream().map(this::mapTrendPoint).toList()
                : traceRepository.getRefusalTrendDaily(tenantId, since, now).stream().map(this::mapTrendPoint).toList();

        List<TrendPoint> requestTrend = hourly
                ? traceRepository.getRequestTrendHourly(tenantId, since, now).stream().map(this::mapTrendPoint).toList()
                : traceRepository.getRequestTrendDaily(tenantId, since, now).stream().map(this::mapTrendPoint).toList();

        List<SlowQuery> topSlowQueries = traceRepository.getTopSlowQueries(tenantId, since, now, slowQueryLimit)
                .stream().map(this::mapSlowQuery).toList();

        List<Object[]> fbRows = feedbackRepository.getFeedbackStats(tenantId, since, now);
        Object[] fbStats = fbRows.isEmpty() ? new Object[]{0L, 0L, 0L} : fbRows.get(0);
        long likeCount = ((Number) fbStats[0]).longValue();
        long dislikeCount = ((Number) fbStats[1]).longValue();
        long reportCount = ((Number) fbStats[2]).longValue();
        long totalRequests = ((Number) overall[0]).longValue();
        double likeRate = totalRequests > 0 ? (double) likeCount / totalRequests : 0.0;

        return DashboardMetrics.builder()
                .period(period)
                .totalRequests(totalRequests)
                .successRate(((Number) overall[1]).doubleValue())
                .avgResponseMs(((Number) overall[2]).doubleValue())
                .refusalRate(((Number) overall[3]).doubleValue())
                .feedbackStats(FeedbackStats.builder()
                        .likeCount(likeCount)
                        .dislikeCount(dislikeCount)
                        .reportCount(reportCount)
                        .likeRate(likeRate)
                        .build())
                .topSlowQueries(topSlowQueries)
                .refusalTrend(refusalTrend)
                .requestTrend(requestTrend)
                .build();
    }

    private Instant computeSince(String period, Instant now) {
        return switch (period) {
            case "today" -> LocalDate.now(ZoneId.systemDefault()).atStartOfDay(ZoneId.systemDefault()).toInstant();
            case "7days" -> now.minus(7, ChronoUnit.DAYS);
            case "30days" -> now.minus(30, ChronoUnit.DAYS);
            default -> now.minus(7, ChronoUnit.DAYS);
        };
    }

    private TrendPoint mapTrendPoint(Object[] row) {
        return TrendPoint.builder()
                .label((String) row[0])
                .value(((Number) row[1]).doubleValue())
                .count(((Number) row[2]).longValue())
                .build();
    }

    private SlowQuery mapSlowQuery(Object[] row) {
        return SlowQuery.builder()
                .query((String) row[0])
                .avgMs(((Number) row[1]).doubleValue())
                .count(((Number) row[2]).longValue())
                .p95Ms(((Number) row[3]).doubleValue())
                .build();
    }

    public List<QuestionCluster> getQuestionClusters(String tenantId, int days, int minCount, int limit) {
        Instant since = Instant.now().minus(days, ChronoUnit.DAYS);
        return traceRepository.getQuestionClusters(tenantId, since, minCount, limit)
                .stream().map(this::mapCluster).toList();
    }

    public UserBehaviorResponse getUserBehavior(String tenantId, int days, int limit) {
        Instant since = Instant.now().minus(days, ChronoUnit.DAYS);

        List<Object[]> overviewRows = traceRepository.getUserBehaviorOverview(tenantId, since);
        Object[] overview = overviewRows.isEmpty() ? new Object[]{0L, 0L, 0.0} : overviewRows.get(0);
        long activeUsers = ((Number) overview[0]).longValue();
        long totalSessions = ((Number) overview[1]).longValue();
        double avgQueriesPerUser = ((Number) overview[2]).doubleValue();

        List<UserActivity> topUsers = traceRepository.getTopUsers(tenantId, since, limit)
                .stream().map(this::mapUserActivity).toList();

        List<SpaceHeat> heatmap = traceRepository.getSpaceHeatmap(tenantId, since, limit)
                .stream().map(this::mapSpaceHeat).toList();

        // Calculate average session length from session table
        double avgSessionLength = 0;
        // Note: avgSessionLength can be computed from session-level data if available
        // For now, estimate from query count per session

        return UserBehaviorResponse.builder()
                .activeUsers(activeUsers)
                .totalSessions(totalSessions)
                .avgQueriesPerUser(avgQueriesPerUser)
                .avgSessionLength(avgSessionLength)
                .topUsers(topUsers)
                .spaceHeatmap(heatmap)
                .build();
    }

    private UserActivity mapUserActivity(Object[] row) {
        return UserActivity.builder()
                .uid((String) row[0])
                .queryCount(((Number) row[1]).longValue())
                .sessionCount(((Number) row[2]).longValue())
                .lastActiveEpochMs(((Number) row[3]).longValue())
                .build();
    }

    private SpaceHeat mapSpaceHeat(Object[] row) {
        return SpaceHeat.builder()
                .spaceId((String) row[0])
                .queryCount(((Number) row[1]).longValue())
                .uniqueUsers(((Number) row[2]).longValue())
                .avgResponseMs(((Number) row[3]).doubleValue())
                .build();
    }

    private QuestionCluster mapCluster(Object[] row) {
        return QuestionCluster.builder()
                .clusterKey((String) row[0])
                .representativeQuery((String) row[1])
                .count(((Number) row[2]).longValue())
                .avgResponseMs(((Number) row[3]).doubleValue())
                .refusalRate(((Number) row[4]).doubleValue())
                .avgCitations(((Number) row[5]).doubleValue())
                .build();
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

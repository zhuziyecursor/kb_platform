package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardMetrics {

    private String period; // "today" / "7days" / "30days"
    private long totalRequests;
    private double successRate;
    private double avgResponseMs;
    private double refusalRate;
    private FeedbackStats feedbackStats;
    private List<SlowQuery> topSlowQueries;
    private List<TrendPoint> refusalTrend;
    private List<TrendPoint> requestTrend;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeedbackStats {
        private long likeCount;
        private long dislikeCount;
        private long reportCount;
        private double likeRate; // likeCount / totalRequests
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SlowQuery {
        private String query;
        private double avgMs;
        private long count;
        private double p95Ms;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrendPoint {
        private String label; // "00:00" for hourly, "2026-05-14" for daily
        private double value;
        private long count;
    }
}

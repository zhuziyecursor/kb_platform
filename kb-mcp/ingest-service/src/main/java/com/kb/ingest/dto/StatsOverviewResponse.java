package com.kb.ingest.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatsOverviewResponse {

    private List<SpaceDocCount> spaceDocCounts;
    private List<DailyDocTrend> dailyTrend;
    private long pendingCount;
    private long failedCount;
    private Long totalVectorCount;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SpaceDocCount {
        private String spaceId;
        private String spaceName;
        private long docCount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailyDocTrend {
        private String date;
        private long count;
    }
}

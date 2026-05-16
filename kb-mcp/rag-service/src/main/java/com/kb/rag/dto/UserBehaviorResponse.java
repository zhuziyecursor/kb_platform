package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserBehaviorResponse {
    private long activeUsers;
    private long totalSessions;
    private double avgQueriesPerUser;
    private double avgSessionLength;
    private List<UserActivity> topUsers;
    private List<SpaceHeat> spaceHeatmap;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserActivity {
        private String uid;
        private long queryCount;
        private long sessionCount;
        private long lastActiveEpochMs;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SpaceHeat {
        private String spaceId;
        private long queryCount;
        private long uniqueUsers;
        private double avgResponseMs;
    }
}

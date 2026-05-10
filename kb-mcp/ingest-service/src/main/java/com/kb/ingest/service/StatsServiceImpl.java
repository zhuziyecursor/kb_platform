package com.kb.ingest.service;

import com.kb.ingest.dto.StatsOverviewResponse;
import com.kb.ingest.repository.KnowledgeDocRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class StatsServiceImpl implements StatsService {

    private final KnowledgeDocRepository docRepository;

    @Override
    @Transactional(readOnly = true)
    public StatsOverviewResponse getOverview(String tenantId) {

        // 1. 各空间文档数分布
        List<Object[]> spaceRows = docRepository.countDocsPerSpace(tenantId);
        List<StatsOverviewResponse.SpaceDocCount> spaceDocCounts = new ArrayList<>();
        for (Object[] row : spaceRows) {
            spaceDocCounts.add(StatsOverviewResponse.SpaceDocCount.builder()
                    .spaceId((String) row[0])
                    .spaceName((String) row[1])
                    .docCount(((Number) row[2]).longValue())
                    .build());
        }

        // 2. 最近 7 天新增文档趋势
        LocalDateTime sinceDate = LocalDateTime.now().minusDays(7);
        List<Object[]> dailyRows = docRepository.countDocsByDay(tenantId, sinceDate);
        List<StatsOverviewResponse.DailyDocTrend> dailyTrend = new ArrayList<>();
        for (Object[] row : dailyRows) {
            dailyTrend.add(StatsOverviewResponse.DailyDocTrend.builder()
                    .date((String) row[0])
                    .count(((Number) row[1]).longValue())
                    .build());
        }

        // 3. 待处理 / 失败文档数
        long pendingCount = docRepository.countByTenantIdAndStatus(tenantId, "PENDING");
        long failedCount = docRepository.countByTenantIdAndStatus(tenantId, "FAILED");

        // 4. 向量库总条目数（Milvus SDK 未在 ingest-service 中引入，返回 placeholder）
        Long totalVectorCount = null;

        return StatsOverviewResponse.builder()
                .spaceDocCounts(spaceDocCounts)
                .dailyTrend(dailyTrend)
                .pendingCount(pendingCount)
                .failedCount(failedCount)
                .totalVectorCount(totalVectorCount)
                .build();
    }
}

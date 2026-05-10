package com.kb.ingest.service;

import com.kb.ingest.dto.StatsOverviewResponse;

public interface StatsService {

    StatsOverviewResponse getOverview(String tenantId);
}

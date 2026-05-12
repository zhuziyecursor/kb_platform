package com.kb.ingest.controller;

import com.kb.ingest.config.DevContextProperties;
import com.kb.ingest.dto.StatsOverviewResponse;
import com.kb.ingest.service.StatsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/kb/v1/stats")
@RequiredArgsConstructor
public class StatsController {

    private final StatsService statsService;
    private final DevContextProperties devContext;

    @GetMapping("/overview")
    public ResponseEntity<StatsOverviewResponse> getOverview() {
        StatsOverviewResponse response = statsService.getOverview(devContext.getTenantId());
        return ResponseEntity.ok(response);
    }
}

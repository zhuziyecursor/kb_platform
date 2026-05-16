package com.kb.rag.service;

import com.kb.rag.config.AlertProperties;
import com.kb.rag.entity.AlertLog;
import com.kb.rag.repository.AlertLogRepository;
import com.kb.rag.repository.RagPipelineTraceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {

    private final AlertProperties alertProperties;
    private final AlertLogRepository alertLogRepository;
    private final RagPipelineTraceRepository traceRepository;

    private static final String DEV_TENANT = "dev-tenant-001";

    @Scheduled(fixedRate = 300_000) // every 5 minutes
    public void checkAlerts() {
        if (!alertProperties.isEnabled()) return;

        Instant now = Instant.now();
        Instant since = now.minus(1, ChronoUnit.HOURS);

        try {
            List<Object[]> rows = traceRepository.getDashboardOverallMetrics(DEV_TENANT, since, now);
            if (rows.isEmpty()) return;
            Object[] metrics = rows.get(0);
            long totalRequests = ((Number) metrics[0]).longValue();
            double successRate = ((Number) metrics[1]).doubleValue();
            double avgResponseMs = ((Number) metrics[2]).doubleValue();
            double refusalRate = ((Number) metrics[3]).doubleValue();

            double errorRate = 1.0 - successRate;

            checkThreshold(DEV_TENANT, "error_rate", errorRate,
                    alertProperties.getThresholds().get("error_rate").getValue(),
                    String.format("错误率 %.1f%% 超过阈值 %.1f%%", errorRate * 100,
                            alertProperties.getThresholds().get("error_rate").getValue() * 100));

            checkThreshold(DEV_TENANT, "refusal_rate", refusalRate,
                    alertProperties.getThresholds().get("refusal_rate").getValue(),
                    String.format("拒答率 %.1f%% 超过阈值 %.1f%%", refusalRate * 100,
                            alertProperties.getThresholds().get("refusal_rate").getValue() * 100));

            // Dead service check
            if (totalRequests == 0) {
                checkThreshold(DEV_TENANT, "dead_service", 0, 0,
                        "过去1小时内无任何请求，服务可能已停止");
            }
        } catch (Exception e) {
            log.warn("Alert check failed: {}", e.getMessage());
        }
    }

    private void checkThreshold(String tenantId, String alertType, double currentValue,
                                 double threshold, String message) {
        if (currentValue <= threshold) return;

        Instant oneHourAgo = Instant.now().minus(1, ChronoUnit.HOURS);
        boolean alreadyFired = alertLogRepository.existsByTenantIdAndAlertTypeAndCreatedAtAfter(
                tenantId, alertType, oneHourAgo);
        if (alreadyFired) return; // deduplicate within 1 hour

        String severity = currentValue > threshold * 2 ? "CRITICAL" : "WARN";

        AlertLog alert = AlertLog.builder()
                .tenantId(tenantId)
                .alertType(alertType)
                .severity(severity)
                .message(message)
                .metricValue(currentValue)
                .thresholdValue(threshold)
                .resolved(false)
                .build();

        alertLogRepository.save(alert);
        log.warn("ALERT [{}] {}: {}", severity, alertType, message);
    }

    @Transactional(readOnly = true)
    public Page<AlertLog> listAlerts(String tenantId, int page, int size) {
        return alertLogRepository.findByTenantIdOrderByCreatedAtDesc(
                tenantId, PageRequest.of(page, size));
    }

    @Transactional
    public void resolveAlert(Long alertId) {
        alertLogRepository.findById(alertId).ifPresent(alert -> {
            alert.setResolved(true);
            alertLogRepository.save(alert);
        });
    }
}

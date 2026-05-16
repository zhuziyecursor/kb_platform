package com.kb.vector.job;

import com.kb.vector.dto.EmbedTaskRetryRequest;
import com.kb.vector.entity.ReconcileLog;
import com.kb.vector.repository.ReconcileLogRepository;
import com.kb.vector.service.EmbedTaskRetryPublisher;
import com.kb.vector.service.MilvusInventoryService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Scheduled job that compares PG (knowledge_search_idx) and Milvus chunk
 * inventories, detects inconsistencies, and writes results to
 * kb_audit.reconcile_log.
 *
 * Runs hourly at :17 past the hour (offset from :00 to avoid contention).
 * Gated by {@code app.reconcile.enabled}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReconcileJob {

    private final MilvusInventoryService inventoryService;
    private final ReconcileLogRepository reconcileLogRepository;
    private final EmbedTaskRetryPublisher embedTaskRetryPublisher;
    private final Optional<MeterRegistry> meterRegistry;
    private final Map<String, AtomicLong> missingGauges = new ConcurrentHashMap<>();

    @Value("${app.reconcile.enabled:true}")
    private boolean enabled;

    @Value("${app.reconcile.auto-repair-enabled:true}")
    private boolean autoRepairEnabled;

    @Value("${app.reconcile.max-repair-batch:1000}")
    private int maxRepairBatch;

    @Scheduled(cron = "${app.reconcile.cron:0 17 * * * *}")
    public void run() {
        if (!enabled) {
            log.debug("ReconcileJob disabled, skipping");
            return;
        }

        log.info("ReconcileJob starting");
        List<String> tenantIds;
        try {
            tenantIds = inventoryService.getDistinctTenantIds();
        } catch (Exception e) {
            log.warn("Failed to list tenants for reconcile: {}", e.getMessage());
            return;
        }

        if (tenantIds.isEmpty()) {
            log.info("ReconcileJob: no tenants found in knowledge_search_idx, skipping");
            return;
        }

        for (String tenantId : tenantIds) {
            try {
                reconcileTenant(tenantId);
            } catch (Exception e) {
                log.error("Reconcile failed for tenant {}: {}", tenantId, e.getMessage());
                saveLog(tenantId, null, null, null, null, 0L, 0L, null, e.getMessage());
            }
        }
        log.info("ReconcileJob completed: {} tenants checked", tenantIds.size());
    }

    private void reconcileTenant(String tenantId) {
        long start = System.nanoTime();

        long pgCount = inventoryService.countPgChunks(tenantId);
        long milvusCount = inventoryService.countMilvusChunks(tenantId);
        log.info("Reconcile tenant={}: pgCount={} milvusCount={}", tenantId, pgCount, milvusCount);

        long missingInMilvus = 0;
        long missingInPg = 0;
        long repairedToMilvus = 0;
        long repairedToPg = 0;
        String error = null;
        long durationMs;

        try {
            long absDiff = Math.abs(pgCount - milvusCount);
            boolean needsDetailed = absDiff > 100 && (pgCount == 0 || absDiff > pgCount * 0.01);

            if (needsDetailed && milvusCount >= 0) {
                log.info("Reconcile tenant={}: counts diverge by {}, running detailed diff", tenantId, absDiff);

                Set<String> pgKeys = inventoryService.getPgChunkKeys(tenantId);
                Set<String> milvusKeys = inventoryService.getMilvusChunkKeys(tenantId);

                Set<String> onlyInPg = new LinkedHashSet<>(pgKeys);
                onlyInPg.removeAll(milvusKeys);
                missingInMilvus = onlyInPg.size();

                Set<String> onlyInMilvus = new LinkedHashSet<>(milvusKeys);
                onlyInMilvus.removeAll(pgKeys);
                missingInPg = onlyInMilvus.size();

                log.info("Reconcile tenant={}: missingInMilvus={} missingInPg={}",
                        tenantId, missingInMilvus, missingInPg);

                if (autoRepairEnabled && !onlyInPg.isEmpty()) {
                    if (missingInMilvus > maxRepairBatch) {
                        log.warn("Reconcile tenant={}: missingInMilvus={} > maxRepairBatch={}, "
                                + "halting auto-repair (needs investigation)",
                                tenantId, missingInMilvus, maxRepairBatch);
                    } else {
                        repairedToMilvus = publishRetryRequests(tenantId, onlyInPg);
                    }
                }

                if (missingInPg > maxRepairBatch) {
                    log.warn("Reconcile tenant={}: missingInPg={} > maxRepairBatch={} (Milvus-only chunks; "
                            + "should not happen, escalate)",
                            tenantId, missingInPg, maxRepairBatch);
                }
            }
        } catch (Exception e) {
            error = e.getMessage();
            log.error("Reconcile error for tenant {}: {}", tenantId, e.getMessage());
        }

        durationMs = (System.nanoTime() - start) / 1_000_000;

        long finalMissing = Math.max(missingInMilvus - repairedToMilvus, 0);
        meterRegistry.ifPresent(registry -> {
            AtomicLong gauge = missingGauges.computeIfAbsent(tenantId,
                    tid -> registry.gauge("rag.reconcile.missing_in_milvus",
                            Tags.of("tenant", tid), new AtomicLong(0)));
            if (gauge != null) gauge.set(finalMissing);
        });

        saveLog(tenantId, pgCount, milvusCount >= 0 ? milvusCount : null,
                missingInMilvus,
                missingInPg,
                repairedToMilvus, repairedToPg, durationMs, error);
    }

    private long publishRetryRequests(String tenantId, Set<String> chunkKeys) {
        long published = 0;
        String traceId = "rec-" + UUID.randomUUID();
        for (String key : chunkKeys) {
            String[] parts = key.split("\\|");
            if (parts.length != 3) {
                log.warn("Skipping malformed chunk key during retry publish: {}", key);
                continue;
            }
            try {
                EmbedTaskRetryRequest req = EmbedTaskRetryRequest.builder()
                        .traceId(traceId)
                        .tenantId(tenantId)
                        .docId(parts[0])
                        .version(Integer.parseInt(parts[1]))
                        .chunkSeq(Integer.parseInt(parts[2]))
                        .reason("RECONCILE_MISSING_IN_MILVUS")
                        .build();
                if (embedTaskRetryPublisher.publish(req)) {
                    published++;
                }
            } catch (NumberFormatException ex) {
                log.warn("Malformed chunk key during retry publish: {}", key);
            }
        }
        log.info("Reconcile tenant={}: published {} embed-task-retry requests", tenantId, published);
        return published;
    }

    private void saveLog(String tenantId, Long pgCount, Long milvusCount,
                         Long missingInMilvus, Long missingInPg,
                         Long repairedToMilvus, Long repairedToPg,
                         Long durationMs, String errorMessage) {
        try {
            ReconcileLog logEntry = ReconcileLog.builder()
                    .tenantId(tenantId)
                    .runAt(Instant.now())
                    .pgCount(pgCount)
                    .milvusCount(milvusCount)
                    .missingInMilvus(missingInMilvus)
                    .missingInPg(missingInPg)
                    .repairedToMilvus(repairedToMilvus)
                    .repairedToPg(repairedToPg)
                    .durationMs(durationMs)
                    .errorMessage(errorMessage)
                    .build();
            reconcileLogRepository.save(logEntry);
        } catch (Exception e) {
            log.error("Failed to persist reconcile_log for tenant {}: {}", tenantId, e.getMessage());
        }
    }
}

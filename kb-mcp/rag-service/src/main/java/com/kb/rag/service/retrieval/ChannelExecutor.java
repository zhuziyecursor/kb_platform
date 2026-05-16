package com.kb.rag.service.retrieval;

import com.kb.rag.service.retrieval.channel.RetrievalChannel;
import com.kb.rag.service.retrieval.channel.ChannelHit;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/**
 * Concurrent channel executor. All applicable channels run in parallel on a
 * dedicated thread pool with per-channel timeouts and Micrometer metrics.
 */
@Slf4j
@Service
public class ChannelExecutor {

    private final List<RetrievalChannel> channels;
    private final ExecutorService channelPool;
    private final Optional<MeterRegistry> meterRegistry;

    public ChannelExecutor(List<RetrievalChannel> channels,
                           @Qualifier("channelPool") ExecutorService channelPool,
                           Optional<MeterRegistry> meterRegistry) {
        this.channels = channels;
        this.channelPool = channelPool;
        this.meterRegistry = meterRegistry;
    }

    public ChannelExecutionResult execute(RetrievalContext context,
                                           Map<RetrievalPlan.ChannelId, Integer> topKMap) {

        List<CompletableFuture<ChannelResult>> futures = new ArrayList<>();

        for (RetrievalChannel channel : channels) {
            if (!channel.isApplicable(context)) continue;

            RetrievalPlan.ChannelId cid = channel.id();
            int topK = topKMap.getOrDefault(cid, 50);

            CompletableFuture<ChannelResult> future = CompletableFuture
                    .supplyAsync(() -> {
                        long startNs = System.nanoTime();
                        try {
                            List<ChannelHit> hits = channel.retrieve(context, topK);
                            long durationMs = (System.nanoTime() - startNs) / 1_000_000;
                            recordChannelMetrics(cid, "success", durationMs, hits.size());
                            return new ChannelResult(cid, hits, true, null);
                        } catch (Exception e) {
                            long durationMs = (System.nanoTime() - startNs) / 1_000_000;
                            log.warn("Channel {} failed: {}", cid, e.getMessage());
                            recordChannelMetrics(cid, "error", durationMs, 0);
                            recordChannelFailed(cid, e.getClass().getSimpleName());
                            return new ChannelResult(cid, List.of(), false, e.getMessage());
                        }
                    }, channelPool)
                    .completeOnTimeout(
                            new ChannelResult(cid, List.of(), false, "timeout"),
                            timeoutMsForChannel(cid), TimeUnit.MILLISECONDS);

            futures.add(future);
        }

        Map<RetrievalPlan.ChannelId, List<ChannelHit>> results = new EnumMap<>(RetrievalPlan.ChannelId.class);
        Map<String, String> failedChannels = new LinkedHashMap<>();
        Set<String> successfulChannels = new LinkedHashSet<>();

        for (CompletableFuture<ChannelResult> future : futures) {
            try {
                ChannelResult cr = future.join();
                results.put(cr.channelId, cr.hits);
                if (cr.success) {
                    successfulChannels.add(cr.channelId.name());
                } else {
                    failedChannels.put(cr.channelId.name(), cr.error != null ? cr.error : "unknown");
                    if ("timeout".equals(cr.error)) {
                        recordChannelTimeout(cr.channelId);
                    }
                }
            } catch (Exception e) {
                log.warn("Channel future join failed: {}", e.getMessage());
            }
        }

        return new ChannelExecutionResult(results, successfulChannels, failedChannels);
    }

    private void recordChannelMetrics(RetrievalPlan.ChannelId cid, String result,
                                       long durationMs, int hitCount) {
        meterRegistry.ifPresent(registry -> {
            Timer.builder("rag.channel.latency")
                    .description("Per-channel retrieval latency")
                    .tag("channel", cid.name())
                    .tag("result", result)
                    .publishPercentileHistogram()
                    .register(registry)
                    .record(Duration.ofMillis(durationMs));
            if (hitCount > 0) {
                DistributionSummary.builder("rag.channel.hits")
                        .description("Hits returned per channel")
                        .tag("channel", cid.name())
                        .publishPercentileHistogram()
                        .register(registry)
                        .record(hitCount);
            }
        });
    }

    private void recordChannelTimeout(RetrievalPlan.ChannelId cid) {
        meterRegistry.ifPresent(registry ->
            Counter.builder("rag.channel.timeout")
                    .description("Channel timeout count")
                    .tag("channel", cid.name())
                    .register(registry)
                    .increment());
    }

    private void recordChannelFailed(RetrievalPlan.ChannelId cid, String reason) {
        meterRegistry.ifPresent(registry ->
            Counter.builder("rag.channel.failed")
                    .description("Channel failure count")
                    .tag("channel", cid.name())
                    .tag("reason", reason)
                    .register(registry)
                    .increment());
    }

    private long timeoutMsForChannel(RetrievalPlan.ChannelId cid) {
        return switch (cid) {
            case DENSE -> 500;
            case SPARSE -> 300;
            case STRUCTURED -> 200;
            case METADATA -> 300;
            case FAQ -> 100;
        };
    }

    private record ChannelResult(
            RetrievalPlan.ChannelId channelId,
            List<ChannelHit> hits,
            boolean success,
            String error
    ) {}
}

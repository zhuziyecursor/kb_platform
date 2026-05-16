package com.kb.rag.service.retrieval.fusion;

import com.kb.rag.service.retrieval.RetrievalPlan;
import com.kb.rag.service.retrieval.channel.ChannelHit;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Function;

import static com.kb.rag.service.retrieval.RetrievalPlan.ChannelId;

/**
 * Multi-channel hybrid fusion replacing the legacy RRFFusionService.
 *
 * Algorithm:
 * 1. Per-channel z-score normalization (≥3 hits) or min-max fallback
 * 2. Channel weights normalized to 1.0 across successful channels
 * 3. RRF + score-norm aggregation per fusion key (docId|version|chunkSeq)
 * 4. Multi-channel boost when ≥3 channels hit the same chunk
 * 5. STRUCTURED rank-1 boost attenuated by matchedDocCount
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HybridFusionService {

    private final Optional<MeterRegistry> meterRegistry;

    @Value("${app.retrieval.fusion.rrf-k.dense:60}")
    private int rrfKDense;
    @Value("${app.retrieval.fusion.rrf-k.sparse:60}")
    private int rrfKSparse;
    @Value("${app.retrieval.fusion.rrf-k.structured:10}")
    private int rrfKStructured;
    @Value("${app.retrieval.fusion.rrf-k.metadata:10}")
    private int rrfKMetadata;
    @Value("${app.retrieval.fusion.rrf-k.faq:5}")
    private int rrfKFaq;

    @Value("${app.retrieval.fusion.score-norm-weight:0.3}")
    private double scoreNormWeight;

    @Value("${app.retrieval.fusion.multi-channel-boost:0.10}")
    private double multiChannelBoost;

    @Value("${app.retrieval.fusion.structured-rank1-boost:0.50}")
    private double structuredRank1Boost;

    /** Default weights: DENSE 0.40, SPARSE 0.30, STRUCTURED 0.15, FAQ 0.10, METADATA 0.05 */
    private static final Map<ChannelId, Double> DEFAULT_WEIGHTS = Map.of(
            ChannelId.DENSE, 0.40,
            ChannelId.SPARSE, 0.30,
            ChannelId.STRUCTURED, 0.15,
            ChannelId.FAQ, 0.10,
            ChannelId.METADATA, 0.05
    );

    public List<FusedHit> fuse(Map<ChannelId, List<ChannelHit>> perChannel,
                               RetrievalPlan plan,
                               Set<ChannelId> successfulChannels) {

        // Metrics: successful channel count distribution + partial failure
        meterRegistry.ifPresent(registry -> {
            Counter.builder("rag.fusion.successful_channels")
                    .description("Number of successful channels per fusion")
                    .tag("count", String.valueOf(successfulChannels.size()))
                    .register(registry)
                    .increment();
            if (successfulChannels.size() < plan.enabledChannels().size()) {
                Counter.builder("rag.fusion.partial_failure")
                        .description("Fusion running with fewer channels than enabled")
                        .register(registry)
                        .increment();
            }
        });

        // 1. Normalize channel weights so they sum to 1.0 across successful channels
        double weightSum = 0.0;
        for (ChannelId c : successfulChannels) {
            weightSum += DEFAULT_WEIGHTS.getOrDefault(c, 0.10);
        }
        if (weightSum < 1e-9) {
            // No successful channel — nothing to fuse.
            return List.of();
        }
        final double normSum = weightSum;

        // 2. Per-channel z-norm
        Map<ChannelId, Function<Double, Double>> normalizers = new EnumMap<>(ChannelId.class);
        for (Map.Entry<ChannelId, List<ChannelHit>> entry : perChannel.entrySet()) {
            normalizers.put(entry.getKey(), ZScoreNormalizer.fit(entry.getValue()));
        }

        // 3. Aggregate by fusion key
        Map<String, Accumulator> acc = new LinkedHashMap<>();
        int structuredMatchCount = plan.clauseRefs() != null ? plan.clauseRefs().size() : 1;

        for (Map.Entry<ChannelId, List<ChannelHit>> entry : perChannel.entrySet()) {
            ChannelId cid = entry.getKey();
            if (!successfulChannels.contains(cid)) continue;

            double w = DEFAULT_WEIGHTS.getOrDefault(cid, 0.10) / normSum;
            int rrfK = rrfKForChannel(cid);
            Function<Double, Double> norm = normalizers.getOrDefault(cid, x -> 0.0);

            for (ChannelHit h : entry.getValue()) {
                String key = buildKey(h.docId(), h.version(), h.chunkSeq());
                Accumulator a = acc.computeIfAbsent(key, k -> new Accumulator(h));

                double rrf = 1.0 / (rrfK + h.rank());
                double normed = sigmoid(norm.apply(h.rawScore()));
                double contribution = w * (rrf + scoreNormWeight * normed);
                a.add(cid, h.rank(), h.rawScore(), contribution);
            }
        }

        // 4. Multi-channel boost: only when ≥3 channels succeeded
        if (successfulChannels.size() >= 3) {
            for (Accumulator a : acc.values()) {
                if (a.channelCount() >= 3) {
                    a.boost(multiChannelBoost);
                }
            }
        }

        // 5. STRUCTURED rank-1 boost, attenuated by matchedDocCount
        for (Accumulator a : acc.values()) {
            if (a.ranks.containsKey(ChannelId.STRUCTURED)
                    && a.ranks.get(ChannelId.STRUCTURED) == 1) {
                double boost = structuredRank1Boost / Math.log(1 + structuredMatchCount);
                a.boost(boost);
            }
        }

        return acc.values().stream()
                .map(Accumulator::toFusedHit)
                .sorted(Comparator.comparingDouble(FusedHit::fusionScore).reversed())
                .toList();
    }

    public static String buildKey(String docId, int version, int chunkSeq) {
        return docId + "|" + version + "|" + chunkSeq;
    }

    private int rrfKForChannel(ChannelId cid) {
        return switch (cid) {
            case DENSE -> rrfKDense;
            case SPARSE -> rrfKSparse;
            case STRUCTURED -> rrfKStructured;
            case METADATA -> rrfKMetadata;
            case FAQ -> rrfKFaq;
        };
    }

    private static double sigmoid(double x) {
        return 1.0 / (1.0 + Math.exp(-x));
    }

    private static class Accumulator {
        ChannelHit representative;
        double score;
        Map<ChannelId, Integer> ranks = new EnumMap<>(ChannelId.class);
        Map<ChannelId, Double> scores = new EnumMap<>(ChannelId.class);

        Accumulator(ChannelHit rep) {
            this.representative = rep;
        }

        void add(ChannelId cid, int rank, double rawScore, double contribution) {
            score += contribution;
            ranks.merge(cid, rank, Math::min);
            scores.merge(cid, rawScore, Math::max);
        }

        void boost(double amount) {
            score += amount;
        }

        int channelCount() {
            return ranks.size();
        }

        FusedHit toFusedHit() {
            return new FusedHit(
                    representative.docId(),
                    representative.version(),
                    representative.chunkSeq(),
                    score,
                    Collections.unmodifiableMap(ranks),
                    Collections.unmodifiableMap(scores),
                    representative);
        }
    }
}

package com.kb.rag.service.retrieval.fusion;

import com.kb.rag.service.retrieval.RetrievalPlan;
import com.kb.rag.service.retrieval.channel.ChannelHit;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

class ZScoreNormalizerTest {

    @Test
    void emptyInput_returnsZeroFunction() {
        Function<Double, Double> norm = ZScoreNormalizer.fit(List.of());
        assertThat(norm.apply(0.0)).isEqualTo(0.0);
        assertThat(norm.apply(100.0)).isEqualTo(0.0);
    }

    @Test
    void zScore_pathWhenSizeAtLeastThree() {
        Function<Double, Double> norm = ZScoreNormalizer.fit(List.of(
                hit(0.5), hit(1.0), hit(1.5)));

        // mean=1.0, std≈0.408 → norm(0.5)≈-1.22, norm(1.0)=0, norm(1.5)≈+1.22
        assertThat(norm.apply(1.0)).isCloseTo(0.0, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(norm.apply(0.5)).isNegative();
        assertThat(norm.apply(1.5)).isPositive();
        // Should be unbounded — significantly bigger than 1
        assertThat(Math.abs(norm.apply(0.5))).isGreaterThan(1.0);
    }

    @Test
    void minMaxFallback_whenLessThanThreeSamples() {
        Function<Double, Double> norm = ZScoreNormalizer.fit(List.of(hit(0.0), hit(1.0)));
        // min=0, max=1 → maps to [-1, 1]
        assertThat(norm.apply(0.0)).isCloseTo(-1.0, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(norm.apply(0.5)).isCloseTo(0.0, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(norm.apply(1.0)).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-6));
    }

    @Test
    void constantScores_returnNeutralZero() {
        Function<Double, Double> norm = ZScoreNormalizer.fit(List.of(hit(0.7), hit(0.7), hit(0.7)));
        assertThat(norm.apply(0.7)).isEqualTo(0.0);
        assertThat(norm.apply(0.0)).isEqualTo(0.0);
    }

    @Test
    void monotonic_higherRawScoreYieldsHigherNormalized() {
        Function<Double, Double> norm = ZScoreNormalizer.fit(List.of(
                hit(0.1), hit(0.5), hit(0.9), hit(0.3)));
        assertThat(norm.apply(0.9)).isGreaterThan(norm.apply(0.5));
        assertThat(norm.apply(0.5)).isGreaterThan(norm.apply(0.1));
    }

    private static ChannelHit hit(double score) {
        return new ChannelHit(RetrievalPlan.ChannelId.DENSE,
                "doc", 1, 0, 1, score, "", "", 1, 1L, "", "", Map.of());
    }
}

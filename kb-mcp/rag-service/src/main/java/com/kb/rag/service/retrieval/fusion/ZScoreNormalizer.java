package com.kb.rag.service.retrieval.fusion;

import com.kb.rag.service.retrieval.channel.ChannelHit;

import java.util.List;
import java.util.function.Function;

/**
 * Normalizes raw channel scores so they can be combined across heterogeneous
 * channels. Returns a centered/unbounded value; the caller is responsible for
 * any squashing (e.g. sigmoid) needed for stable weighting.
 *
 * <ul>
 *   <li>≥3 samples with non-zero std → z-score {@code (x - mean) / std}</li>
 *   <li>≥2 samples with non-zero range → min-max mapped to {@code [-1, 1]}</li>
 *   <li>Empty / constant scores → neutral 0.0</li>
 * </ul>
 */
public final class ZScoreNormalizer {

    private ZScoreNormalizer() {}

    public static Function<Double, Double> fit(List<ChannelHit> hits) {
        if (hits == null || hits.isEmpty()) {
            return x -> 0.0;
        }

        double[] scores = hits.stream().mapToDouble(ChannelHit::rawScore).toArray();
        double mean = mean(scores);
        double std = std(scores, mean);

        if (hits.size() >= 3 && std > 1e-9) {
            return x -> (x - mean) / std;
        }

        double minVal = Double.POSITIVE_INFINITY;
        double maxVal = Double.NEGATIVE_INFINITY;
        for (double s : scores) {
            if (s < minVal) minVal = s;
            if (s > maxVal) maxVal = s;
        }
        double range = maxVal - minVal;
        if (range < 1e-9) {
            return x -> 0.0;
        }
        final double fMin = minVal;
        final double fRange = range;
        return x -> 2.0 * (x - fMin) / fRange - 1.0;
    }

    private static double mean(double[] arr) {
        double sum = 0;
        for (double v : arr) sum += v;
        return sum / arr.length;
    }

    private static double std(double[] arr, double mean) {
        double sumSq = 0;
        for (double v : arr) sumSq += (v - mean) * (v - mean);
        return Math.sqrt(sumSq / arr.length);
    }
}

package com.kb.rag.service.retrieval.diversity;

import java.util.HashSet;
import java.util.Set;

/**
 * Lightweight char-trigram Jaccard similarity for MMR diversity penalty.
 * No embedding call needed; stable for texts ≥ 30 chars.
 */
public final class CharTrigramJaccard {

    private CharTrigramJaccard() {}

    public static double similarity(String a, String b) {
        if (a == null || b == null) return 0.0;
        Set<String> trigramsA = trigrams(a);
        Set<String> trigramsB = trigrams(b);
        if (trigramsA.isEmpty() && trigramsB.isEmpty()) return 0.0;

        Set<String> union = new HashSet<>(trigramsA);
        union.addAll(trigramsB);
        int intersection = 0;
        for (String t : trigramsA) {
            if (trigramsB.contains(t)) intersection++;
        }
        return union.isEmpty() ? 0.0 : (double) intersection / union.size();
    }

    private static Set<String> trigrams(String s) {
        Set<String> set = new HashSet<>();
        for (int i = 0; i + 3 <= s.length(); i++) {
            set.add(s.substring(i, i + 3));
        }
        return set;
    }
}

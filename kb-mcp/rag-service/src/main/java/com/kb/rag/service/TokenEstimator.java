package com.kb.rag.service;

import org.springframework.stereotype.Service;

@Service
public class TokenEstimator {

    private static final int ASCII_CHARS_PER_TOKEN = 4;

    public int estimate(String text) {
        if (text == null || text.isEmpty()) {
            return 0;
        }
        int tokens = 0;
        int asciiRun = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            if (cp <= 0x7F) {
                asciiRun++;
            } else {
                tokens += ceilDiv(asciiRun, ASCII_CHARS_PER_TOKEN);
                asciiRun = 0;
                tokens += 1;
            }
            i += Character.charCount(cp);
        }
        tokens += ceilDiv(asciiRun, ASCII_CHARS_PER_TOKEN);
        return tokens;
    }

    public String truncateHead(String text, int maxTokens) {
        if (text == null || text.isEmpty() || maxTokens <= 0) {
            return "";
        }
        if (estimate(text) <= maxTokens) {
            return text;
        }
        int low = 0;
        int high = text.length();
        int best = 0;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            mid = adjustEnd(text, mid);
            int tokens = estimate(text.substring(0, mid));
            if (tokens <= maxTokens) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return text.substring(0, best).stripTrailing();
    }

    public String truncateTail(String text, int maxTokens) {
        if (text == null || text.isEmpty() || maxTokens <= 0) {
            return "";
        }
        if (estimate(text) <= maxTokens) {
            return text;
        }
        int low = 0;
        int high = text.length();
        int best = text.length();
        while (low <= high) {
            int mid = (low + high) >>> 1;
            mid = adjustStart(text, mid);
            int tokens = estimate(text.substring(mid));
            if (tokens <= maxTokens) {
                best = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        return text.substring(best).stripLeading();
    }

    private int ceilDiv(int value, int divisor) {
        if (value <= 0) {
            return 0;
        }
        return (value + divisor - 1) / divisor;
    }

    private int adjustEnd(String text, int index) {
        if (index > 0 && index < text.length() && Character.isHighSurrogate(text.charAt(index - 1))) {
            return index - 1;
        }
        return index;
    }

    private int adjustStart(String text, int index) {
        if (index > 0 && index < text.length() && Character.isLowSurrogate(text.charAt(index))) {
            return index + 1;
        }
        return index;
    }
}

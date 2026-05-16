package com.kb.rag.service;

import com.kb.rag.dto.CitationDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
public class RefusalService {

    @Value("${app.refusal.confidence-threshold}")
    private double confidenceThreshold;

    /**
     * Bump applied to the confidence threshold when rerank is unavailable.
     * Forces a more conservative refusal so the fusion-score top hit must be
     * decisively above the floor before we hand it to the LLM.
     */
    @Value("${app.refusal.rerank-fallback-bump:0.2}")
    private double rerankFallbackBump;

    public RefusalResult check(List<CitationDto> citations, boolean milvusHadResults) {
        return check(citations, milvusHadResults, false);
    }

    public RefusalResult check(List<CitationDto> citations, boolean milvusHadResults,
                               boolean rerankFallback) {
        if (!milvusHadResults || citations.isEmpty()) {
            return new RefusalResult(true, "NO_MATCH", "知识库中暂时没有找到相关资料");
        }

        double maxScore = citations.stream()
                .mapToDouble(CitationDto::getScore)
                .max()
                .orElse(0);

        double effectiveThreshold = confidenceThreshold + (rerankFallback ? rerankFallbackBump : 0.0);
        if (maxScore < effectiveThreshold) {
            return new RefusalResult(true, "LOW_CONFIDENCE", "知识库中暂时没有找到相关资料");
        }

        return new RefusalResult(false, null, null);
    }

    public RefusalResult noPermission() {
        return new RefusalResult(true, "NO_PERMISSION", "您没有权限查看相关内容");
    }

    public RefusalResult denseUnavailable() {
        return new RefusalResult(true, "DENSE_UNAVAILABLE", "知识库中暂时没有找到相关资料");
    }

    public record RefusalResult(boolean refused, String reason, String message) {}
}

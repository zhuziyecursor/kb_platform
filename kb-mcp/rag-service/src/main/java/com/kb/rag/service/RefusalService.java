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

    public RefusalResult check(List<CitationDto> citations, boolean milvusHadResults) {
        if (!milvusHadResults || citations.isEmpty()) {
            return new RefusalResult(true, "NO_MATCH", "知识库中暂时没有找到相关资料");
        }

        double maxScore = citations.stream()
                .mapToDouble(CitationDto::getScore)
                .max()
                .orElse(0);

        if (maxScore < confidenceThreshold) {
            return new RefusalResult(true, "LOW_CONFIDENCE", "知识库中暂时没有找到相关资料");
        }

        return new RefusalResult(false, null, null);
    }

    public RefusalResult noPermission() {
        return new RefusalResult(true, "NO_PERMISSION", "您没有权限查看相关内容");
    }

    public record RefusalResult(boolean refused, String reason, String message) {}
}

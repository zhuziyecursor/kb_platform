package com.kb.rag.service;

import com.kb.rag.dto.CitationDto;
import com.kb.rag.dto.MilvusSearchResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Parent-Children 回捞服务。
 *
 * 在 Rerank 之后，按 parent_ref 从 Milvus 回捞 Parent chunk 完整文本，
 * 填充到 CitationDto.parentText，用于生成完整上下文。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ParentLookupService {

    private final MilvusSearchService milvusSearchService;

    /**
     * 回捞 Parent 文本并填充到 citations。
     *
     * 流程：
     * 1. 从 citations 收集所有非空的 parentRef
     * 2. 批量查询 Milvus 获取 Parent 文本
     * 3. 填充 CitationDto.parentText
     *
     * @param citations ACL 验证后的 citations（已有 text 字段）
     * @param tenantId 租户 ID
     * @return 填充了 parentText 的 citations
     */
    public List<CitationDto> lookupAndEnrich(List<CitationDto> citations, String tenantId) {
        if (citations == null || citations.isEmpty()) {
            return citations;
        }

        // 收集所有非空的 parentRef
        Set<String> parentRefs = citations.stream()
                .map(CitationDto::getParentRef)
                .filter(ref -> ref != null && !ref.isEmpty())
                .collect(Collectors.toSet());

        if (parentRefs.isEmpty()) {
            log.debug("No parentRef found in citations, skip Parent lookup");
            return citations;
        }

        // 批量查询 Milvus 获取 Parent 文本
        Map<String, String> parentTextMap = milvusSearchService.queryParentTexts(parentRefs, tenantId);
        log.info("Parent lookup: {} refs -> {} texts found", parentRefs.size(), parentTextMap.size());

        // 填充 parentText 到 citations
        for (CitationDto citation : citations) {
            String parentRef = citation.getParentRef();
            if (parentRef != null && !parentRef.isEmpty()) {
                String parentText = parentTextMap.get(parentRef);
                if (parentText != null && !parentText.isEmpty()) {
                    citation.setParentText(parentText);
                }
            }
        }

        return citations;
    }
}

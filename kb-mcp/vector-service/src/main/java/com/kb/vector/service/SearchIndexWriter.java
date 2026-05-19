package com.kb.vector.service;

import com.kb.vector.dto.EmbedTaskMessage;
import com.kb.vector.repository.KnowledgeSearchIdxRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class SearchIndexWriter {

    private final KnowledgeSearchIdxRepository repository;

    public void write(EmbedTaskMessage msg) {
        // Merge keywords + text so that ON CONFLICT updates also include keywords in tokens.
        String mergedText = (msg.getKeywords() != null && !msg.getKeywords().isBlank()
                ? msg.getKeywords() + " " : "")
                + (msg.getText() != null ? msg.getText() : "");

        repository.upsert(
                msg.getTenantId(),
                msg.getDocId(),
                msg.getVersion(),
                msg.getChunkSeq(),
                msg.getTitle(),
                mergedText,   // text_snippet now contains keywords for correct ON CONFLICT token refresh
                mergedText,   // tsvectorInput
                msg.getSecLevel() != null ? msg.getSecLevel() : 1,
                msg.getPermGroupId() != null ? msg.getPermGroupId() : 0L,
                msg.getEffectiveTo(),
                msg.getRegionCode() != null ? msg.getRegionCode() : "CN-NATIONAL"
        );

        log.debug("BM25 search index updated: docId={} chunkSeq={}", msg.getDocId(), msg.getChunkSeq());
    }
}

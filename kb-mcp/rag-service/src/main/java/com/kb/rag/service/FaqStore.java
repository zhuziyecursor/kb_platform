package com.kb.rag.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.entity.FaqKnowledge;
import com.kb.rag.repository.FaqKnowledgeRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory FAQ store. Loads all FAQs and their embeddings at startup,
 * refreshes periodically. Supports fast cosine similarity matching.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FaqStore {

    private final FaqKnowledgeRepository faqKnowledgeRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final TypeReference<List<Float>> FLOAT_LIST_TYPE = new TypeReference<>() {};

    private final Map<String, List<FaqEntry>> entriesByTenant = new ConcurrentHashMap<>();

    public record FaqEntry(
            long id,
            String tenantId,
            String question,
            String answer,
            List<Float> embedding,
            String spaceId,
            long hitCount,
            int secLevel,
            long permGroupId,
            String effectiveTo,
            String regionCode
    ) {}

    @PostConstruct
    void init() {
        refresh();
    }

    @Scheduled(fixedRateString = "${app.faq.refresh-interval-seconds:300}000")
    void refresh() {
        try {
            List<FaqKnowledge> allFaqs = faqKnowledgeRepository.findAll();
            Map<String, List<FaqEntry>> newEntries = new ConcurrentHashMap<>();

            for (FaqKnowledge faq : allFaqs) {
                List<Float> embedding = parseEmbedding(faq.getEmbeddingJson());
                FaqEntry entry = new FaqEntry(
                        faq.getId(), faq.getTenantId(), faq.getQuestion(),
                        faq.getAnswer(), embedding, faq.getSpaceId(), faq.getHitCount(),
                        faq.getSecLevel(), faq.getPermGroupId(),
                        faq.getEffectiveTo(), faq.getRegionCode());
                newEntries.computeIfAbsent(faq.getTenantId(), k -> new java.util.ArrayList<>())
                        .add(entry);
            }

            entriesByTenant.clear();
            entriesByTenant.putAll(newEntries);
            log.info("FaqStore refreshed: {} tenants, {} total FAQs",
                    entriesByTenant.size(), allFaqs.size());
        } catch (Exception e) {
            log.warn("FaqStore refresh failed: {}", e.getMessage());
        }
    }

    public List<FaqEntry> getEntries(String tenantId) {
        return entriesByTenant.getOrDefault(tenantId, List.of());
    }

    private List<Float> parseEmbedding(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, FLOAT_LIST_TYPE);
        } catch (Exception e) {
            log.debug("Failed to parse FAQ embedding: {}", e.getMessage());
            return List.of();
        }
    }
}

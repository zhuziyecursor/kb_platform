package com.kb.publicapi.service;

import com.kb.publicapi.audit.AuditLogger;
import com.kb.publicapi.config.PublicApiProperties;
import com.kb.publicapi.dto.ChatRequest;
import com.kb.publicapi.dto.ChatResponse;
import com.kb.publicapi.dto.CitationDto;
import com.kb.publicapi.exception.PublicApiException;
import com.kb.publicapi.security.RequestContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatServiceImpl implements ChatService {

    private final RestTemplate ragRestTemplate;
    private final PublicApiProperties properties;
    private final AuditLogger auditLogger;

    @Override
    public ChatResponse chat(ChatRequest request) {
        long startTime = System.currentTimeMillis();
        String traceId = "tr-" + UUID.randomUUID();
        var apiKeyConfig = RequestContext.get();
        String tenantId = apiKeyConfig.tenantId();

        // 1. Build internal ChatRequest for rag-service (includes tenantId)
        Map<String, Object> internalRequest = new java.util.LinkedHashMap<>();
        internalRequest.put("tenantId", tenantId);
        internalRequest.put("query", request.getQuery());
        if (request.getSessionId() != null) {
            internalRequest.put("sessionId", request.getSessionId());
        }
        if (request.getBiz() != null) {
            internalRequest.put("biz", request.getBiz());
        }
        internalRequest.put("lang", request.getLang() != null ? request.getLang() : "zh");
        internalRequest.put("topK", request.getTopK() != null ? request.getTopK() : 20);
        if (request.getSpaceId() != null) {
            internalRequest.put("spaceId", request.getSpaceId());
        }

        // 2. Call rag-service
        String ragBaseUrl = properties.getClient().getRagService().getBaseUrl();
        ResponseEntity<Map> resp;
        try {
            resp = ragRestTemplate.postForEntity(
                    ragBaseUrl + "/rag/v1/chat",
                    new HttpEntity<>(internalRequest),
                    Map.class);
        } catch (Exception e) {
            log.error("rag-service chat failed", e);
            throw PublicApiException.upstreamUnavailable("rag-service");
        }

        if (resp.getBody() == null) {
            throw PublicApiException.upstreamError("rag-service returned empty body");
        }

        Map<String, Object> data = resp.getBody();

        // 3. Map citations
        List<CitationDto> citations = new ArrayList<>();
        Object citationsObj = data.get("citations");
        if (citationsObj instanceof List<?> rawList) {
            for (Object item : rawList) {
                if (item instanceof Map<?, ?> c) {
                    citations.add(CitationDto.builder()
                            .index(c.get("index") != null ? ((Number) c.get("index")).intValue() : null)
                            .docId((String) c.get("docId"))
                            .title((String) c.get("title"))
                            .version(c.get("version") != null ? ((Number) c.get("version")).intValue() : null)
                            .chunkSeq(c.get("chunkSeq") != null ? ((Number) c.get("chunkSeq")).intValue() : null)
                            .page(c.get("page") != null ? ((Number) c.get("page")).intValue() : null)
                            .sectionPath((String) c.get("sectionPath"))
                            .spaceId((String) c.get("spaceId"))
                            .spacePath((String) c.get("spacePath"))
                            .score(c.get("score") != null ? ((Number) c.get("score")).doubleValue() : null)
                            .isCurrent((Boolean) c.get("isCurrent"))
                            .effectiveFrom((String) c.get("effectiveFrom"))
                            .effectiveTo((String) c.get("effectiveTo"))
                            .text((String) c.get("text"))
                            .build());
                }
            }
        }

        // 4. Build response
        ChatResponse response = ChatResponse.builder()
                .answer((String) data.get("answer"))
                .citations(citations)
                .traceId((String) data.getOrDefault("traceId", traceId))
                .reason((String) data.get("reason"))
                .sessionId((String) data.get("sessionId"))
                .confidence((String) data.get("confidence"))
                .build();

        // 5. Audit
        long latency = System.currentTimeMillis() - startTime;
        auditLogger.log("pk-dev-0000000000000001", tenantId, "POST", "/openapi/v1/kb/chat",
                null, 200, response.getTraceId(), null, latency);

        return response;
    }
}

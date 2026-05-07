package com.kb.rag.service;

import com.kb.rag.dto.LlmGatewayRequest;
import com.kb.rag.dto.LlmGatewayResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Slf4j
@Service
@RequiredArgsConstructor
public class LlmGatewayClient {

    private final RestTemplate restTemplate;

    @Value("${app.llm.url}")
    private String llmUrl;

    @Value("${app.llm.max-retries}")
    private int maxRetries;

    public String generate(LlmGatewayRequest request, String traceId, String tenantId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Trace-Id", traceId);
        headers.set("X-Tenant-Id", tenantId);
        HttpEntity<LlmGatewayRequest> entity = new HttpEntity<>(request, headers);

        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                ResponseEntity<LlmGatewayResponse> response = restTemplate.postForEntity(
                        llmUrl, entity, LlmGatewayResponse.class);

                if (response.getBody() != null
                        && response.getBody().getChoice() != null
                        && response.getBody().getChoice().getMessage() != null) {
                    return response.getBody().getChoice().getMessage().getContent();
                }
                throw new RuntimeException("Empty LLM response");
            } catch (RestClientException e) {
                log.warn("LLM gateway attempt {}/{} failed: {}", attempt + 1, maxRetries, e.getMessage());
                if (attempt == maxRetries - 1) {
                    throw new RuntimeException("LLM gateway error after " + maxRetries + " retries", e);
                }
                sleep(1L << attempt);
            }
        }
        throw new RuntimeException("LLM gateway unreachable");
    }

    private void sleep(long seconds) {
        try {
            Thread.sleep(seconds * 1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

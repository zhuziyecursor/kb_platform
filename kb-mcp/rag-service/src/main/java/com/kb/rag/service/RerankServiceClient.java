package com.kb.rag.service;

import com.kb.rag.dto.RerankRequest;
import com.kb.rag.dto.RerankResponse;
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

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RerankServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.rerank.url}")
    private String rerankUrl;

    @Value("${app.rerank.max-retries}")
    private int maxRetries;

    public List<RerankResponse.Result> rerank(String query, List<String> documents) {
        if (documents == null || documents.isEmpty()) {
            return Collections.emptyList();
        }

        RerankRequest request = RerankRequest.builder()
                .query(query)
                .documents(documents.stream()
                        .map(text -> RerankRequest.RerankDocument.builder().text(text).build())
                        .collect(Collectors.toList()))
                .build();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<RerankRequest> entity = new HttpEntity<>(request, headers);

        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                ResponseEntity<RerankResponse> response = restTemplate.postForEntity(
                        rerankUrl, entity, RerankResponse.class);

                if (response.getBody() != null && response.getBody().getResults() != null) {
                    return response.getBody().getResults();
                }
                throw new RuntimeException("Empty rerank response");
            } catch (RestClientException e) {
                log.warn("Rerank attempt {}/{} failed: {}", attempt + 1, maxRetries, e.getMessage());
                if (attempt == maxRetries - 1) {
                    throw new RuntimeException("Rerank service error after " + maxRetries + " retries", e);
                }
                sleep(1L << attempt);
            }
        }
        throw new RuntimeException("Rerank service unreachable");
    }

    private void sleep(long seconds) {
        try {
            Thread.sleep(seconds * 1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

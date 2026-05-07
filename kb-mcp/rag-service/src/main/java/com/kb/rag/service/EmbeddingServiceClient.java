package com.kb.rag.service;

import com.kb.rag.dto.EmbeddingRequest;
import com.kb.rag.dto.EmbeddingResponse;
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

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmbeddingServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.embedding.url}")
    private String embeddingUrl;

    @Value("${app.embedding.max-retries}")
    private int maxRetries;

    public List<Float> embed(String text) {
        EmbeddingRequest request = EmbeddingRequest.builder()
                .input(List.of(text))
                .build();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<EmbeddingRequest> entity = new HttpEntity<>(request, headers);

        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                ResponseEntity<EmbeddingResponse> response = restTemplate.postForEntity(
                        embeddingUrl, entity, EmbeddingResponse.class);

                if (response.getBody() != null && response.getBody().getData() != null
                        && !response.getBody().getData().isEmpty()) {
                    return response.getBody().getData().get(0).getEmbedding();
                }
                throw new RuntimeException("Empty embedding response");
            } catch (RestClientException e) {
                log.warn("Embedding attempt {}/{} failed: {}", attempt + 1, maxRetries, e.getMessage());
                if (attempt == maxRetries - 1) {
                    throw new RuntimeException("Embedding service error after " + maxRetries + " retries", e);
                }
                sleep(1L << attempt);
            }
        }
        throw new RuntimeException("Embedding service unreachable");
    }

    private void sleep(long seconds) {
        try {
            Thread.sleep(seconds * 1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

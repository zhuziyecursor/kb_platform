package com.kb.rag.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.dto.EmbeddingRequest;
import com.kb.rag.dto.EmbeddingResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmbeddingServiceClient {

    private final RestTemplate restTemplate;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.embedding.url}")
    private String embeddingUrl;

    @Value("${app.embedding.max-retries}")
    private int maxRetries;

    @Value("${app.embedding.cache-ttl-minutes:30}")
    private int cacheTtlMinutes;

    private static final String EMB_CACHE_PREFIX = "kb:emb:";
    private static final TypeReference<List<Float>> FLOAT_LIST_TYPE = new TypeReference<>() {};

    public List<Float> embed(String text) {
        String cacheKey = buildCacheKey(text);

        // 1. Try Redis cache
        try {
            String cached = stringRedisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                List<Float> vector = objectMapper.readValue(cached, FLOAT_LIST_TYPE);
                log.debug("Embedding cache hit: key={}", cacheKey);
                return vector;
            }
        } catch (Exception e) {
            log.warn("Embedding cache read failed: {}", e.getMessage());
        }

        // 2. Call embedding service
        List<Float> vector = fetchEmbedding(text);

        // 3. Write to Redis cache
        try {
            stringRedisTemplate.opsForValue().set(
                    cacheKey,
                    objectMapper.writeValueAsString(vector),
                    Duration.ofMinutes(cacheTtlMinutes)
            );
            log.debug("Embedding cached: key={}", cacheKey);
        } catch (Exception e) {
            log.warn("Embedding cache write failed: {}", e.getMessage());
        }

        return vector;
    }

    private List<Float> fetchEmbedding(String text) {
        EmbeddingRequest request = EmbeddingRequest.builder()
                .input(List.of(text))
                .build();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<EmbeddingRequest> entity = new HttpEntity<>(request, headers);

        Exception lastException = null;
        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                ResponseEntity<EmbeddingResponse> response = restTemplate.postForEntity(
                        embeddingUrl, entity, EmbeddingResponse.class);

                if (response.getBody() != null && response.getBody().getData() != null
                        && !response.getBody().getData().isEmpty()) {
                    return response.getBody().getData().get(0).getEmbedding();
                }
                throw new RuntimeException("Empty embedding response");
            } catch (Exception e) {
                lastException = e;
                log.warn("Embedding attempt {}/{} failed: {}", attempt + 1, maxRetries, e.getMessage());
                if (attempt == maxRetries - 1) {
                    throw new RuntimeException("Embedding service error after " + maxRetries + " retries", e);
                }
                sleep(1L << attempt);
            }
        }
        throw new RuntimeException("Embedding service unreachable", lastException);
    }

    private String buildCacheKey(String text) {
        return EMB_CACHE_PREFIX + sha256(text);
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString().substring(0, 16);
        } catch (NoSuchAlgorithmException e) {
            return Integer.toHexString(input.hashCode());
        }
    }

    private void sleep(long seconds) {
        try {
            Thread.sleep(seconds * 1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

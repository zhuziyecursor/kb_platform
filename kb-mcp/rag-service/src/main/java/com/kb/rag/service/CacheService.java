package com.kb.rag.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.dto.ChatResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Collections;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CacheService {

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.cache.ttl-minutes}")
    private int cacheTtlMinutes;

    private static final String CACHE_KEY_PREFIX = "kb:search:";

    public String buildCacheKey(String tenantId, String query, List<Long> permGroupIds) {
        String queryHash = sha256(query);
        List<Long> sorted = new java.util.ArrayList<>(permGroupIds);
        Collections.sort(sorted);
        String permGroups = sorted.stream()
                .map(String::valueOf)
                .reduce((a, b) -> a + "," + b)
                .orElse("none");

        return CACHE_KEY_PREFIX + tenantId + ":" + queryHash + ":" + permGroups;
    }

    public ChatResponse get(String cacheKey) {
        String json = stringRedisTemplate.opsForValue().get(cacheKey);
        if (json == null) {
            return null;
        }
        try {
            return objectMapper.readValue(json, ChatResponse.class);
        } catch (JsonProcessingException e) {
            log.warn("Failed to deserialize cache entry: {}", e.getMessage());
            return null;
        }
    }

    public void put(String cacheKey, ChatResponse response) {
        try {
            stringRedisTemplate.opsForValue().set(
                    cacheKey,
                    objectMapper.writeValueAsString(response),
                    Duration.ofMinutes(cacheTtlMinutes)
            );
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize cache entry: {}", e.getMessage());
        }
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
}

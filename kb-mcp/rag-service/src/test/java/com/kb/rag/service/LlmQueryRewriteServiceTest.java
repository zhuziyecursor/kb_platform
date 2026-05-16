package com.kb.rag.service;

import com.kb.rag.dto.LlmRewriteResponse;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class LlmQueryRewriteServiceTest {

    private final LlmGatewayClient llmGatewayClient = mock(LlmGatewayClient.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final LlmQueryRewriteService rewriteService = new LlmQueryRewriteService(
            llmGatewayClient,
            redisTemplate);

    LlmQueryRewriteServiceTest() {
        ReflectionTestUtils.setField(rewriteService, "llmEnabled", true);
        ReflectionTestUtils.setField(rewriteService, "minQueryLengthForLlm", 6);
        ReflectionTestUtils.setField(rewriteService, "cacheTtlMinutes", 30);
        ReflectionTestUtils.setField(rewriteService, "rewriteModel", "test-model");
        ReflectionTestUtils.setField(rewriteService, "temperature", 0.1);
        ReflectionTestUtils.setField(rewriteService, "maxTokens", 512);
    }

    @Test
    void rewriteContinuesWhenRedisReadFails() {
        when(redisTemplate.opsForValue()).thenThrow(new DataAccessResourceFailureException("redis down"));
        when(llmGatewayClient.generate(any(), anyString(), anyString()))
                .thenReturn("""
                        {
                          "mainQuery": "Hermes Agent 的安装方式有哪几种？",
                          "subQueries": [],
                          "keywords": ["Hermes Agent", "安装方式"],
                          "intent": "POLICY_QA"
                        }
                        """);

        LlmRewriteResponse response = rewriteService.rewrite("Hermes Agent 的安装方式有哪几种？", List.of());

        assertThat(response).isNotNull();
        assertThat(response.getMainQuery()).isEqualTo("Hermes Agent 的安装方式有哪几种？");
        assertThat(response.getIntent()).isEqualTo("POLICY_QA");
    }

    @Test
    void rewriteContinuesWhenRedisWriteFails() {
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOps = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        doThrow(new DataAccessResourceFailureException("redis down"))
                .when(valueOps).set(anyString(), anyString(), any());
        when(llmGatewayClient.generate(any(), anyString(), anyString()))
                .thenReturn("""
                        {
                          "mainQuery": "Hermes Agent 的安装方式有哪几种？",
                          "subQueries": [],
                          "keywords": ["Hermes Agent", "安装方式"],
                          "intent": "POLICY_QA"
                        }
                        """);

        LlmRewriteResponse response = rewriteService.rewrite("Hermes Agent 的安装方式有哪几种？", List.of());

        assertThat(response).isNotNull();
        assertThat(response.getKeywords()).contains("Hermes Agent", "安装方式");
    }
}

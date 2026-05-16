package com.kb.rag.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.dto.LlmGatewayRequest;
import com.kb.rag.dto.LlmRewriteResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class LlmQueryRewriteService {

    private final LlmGatewayClient llmGatewayClient;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.query-rewrite.llm-enabled:true}")
    private boolean llmEnabled;

    @Value("${app.query-rewrite.min-query-length-for-llm:6}")
    private int minQueryLengthForLlm;

    @Value("${app.query-rewrite.cache-ttl-minutes:30}")
    private int cacheTtlMinutes;

    @Value("${app.llm.model}")
    private String rewriteModel;

    @Value("${app.query-rewrite.temperature:0.1}")
    private double temperature;

    @Value("${app.query-rewrite.max-tokens:512}")
    private int maxTokens;

    private static final Pattern SIMPLE_QUERY_PATTERN = Pattern.compile(
            "^.{1,5}$|^(你好|谢谢|再见|帮助|菜单|开始|结束|取消|确定|返回)$");

    private static final Pattern PRONOUN_PATTERN = Pattern.compile(
            "^(那|那么|这个|那个|这些|那些|上述|以上|前面|刚才|刚刚|它|他|她|其)");

    /**
     * Matches queries that contain interrogative/question structure — these benefit from LLM rewriting.
     * Queries WITHOUT these markers are likely keyword searches that can skip the LLM round-trip.
     */
    private static final Pattern INTERROGATIVE_PATTERN = Pattern.compile(
            "什么|怎么|如何|为什么|为何|哪个|哪些|谁|是否|能不能|可以不可以|" +
            "有没有|多少钱|怎样|怎么样|吗|呢|吧|呀|啊|\\?|？|请问|请告诉");

    private static final Pattern REQUEST_PREFIX = Pattern.compile(
            "^(请|帮我|告诉|说明|解释|介绍|查找|搜索|查|找|帮我查|帮我找)");

    @Value("${app.query-rewrite.max-keyword-length:25}")
    private int maxKeywordQueryLength;

    private static final String REWRITE_SYSTEM_PROMPT = """
            你是知识库查询改写助手。根据用户问题和对话历史，输出一个 JSON 对象（不要输出其他内容）：

            {
              "main_query": "改写后的主查询，补充上下文、消解指代、扩展同义词",
              "sub_queries": ["子问题1", "子问题2"],
              "keywords": ["关键词1", "关键词2", "关键词3"],
              "intent": "POLICY_QA"
            }

            intent 取值说明：
            - POLICY_QA: 用户问的是知识库中的政策/制度/规定/流程相关问题，需要从知识库检索生成答案
            - DOC_SEARCH: 用户想查找文档、找资料、搜索特定内容，只需返回匹配的文档列表
            - CHITCHAT: 用户是寒暄、闲聊、问候、或问知识库之外的问题，无需检索知识库

            改写要求：
            - 保留原问题的所有约束条件和限定词
            - 缺失主语时从历史对话中补充
            - 将口语化表达转为正式用语
            - 指代词（那、这个、上述）替换为具体实体
            - 如果原问题已经清晰完整，main_query 可以与原问题相同
            - 如果问题不需要分解，sub_queries 可以为空数组
            - keywords 提取问题中的核心术语、专有名词、缩写
            """;

    private static final String CACHE_KEY_PREFIX = "kb:rewrite:";

    public LlmRewriteResponse rewrite(String query, List<SessionService.Turn> history) {
        if (!llmEnabled) {
            return null;
        }

        if (isSimpleQuery(query, history)) {
            log.debug("Query too simple for LLM rewrite: {}", query);
            return null;
        }

        String cacheKey = buildCacheKey(query, history);
        LlmRewriteResponse cached = getCached(cacheKey);
        if (cached != null) {
            log.debug("Rewrite cache hit: {}", cacheKey);
            return cached;
        }

        try {
            LlmRewriteResponse result = callLlmForRewrite(query, history);
            if (result != null) {
                cacheResult(cacheKey, result);
            }
            return result;
        } catch (Exception e) {
            log.warn("LLM rewrite failed, fallback to synonym: {}", e.getMessage());
            return null;
        }
    }

    private boolean isSimpleQuery(String query, List<SessionService.Turn> history) {
        if (query == null || query.trim().isEmpty()) {
            return true;
        }
        String trimmed = query.trim();

        if (SIMPLE_QUERY_PATTERN.matcher(trimmed).matches()) {
            return true;
        }

        boolean hasHistory = history != null && !history.isEmpty();
        boolean hasPronoun = PRONOUN_PATTERN.matcher(trimmed).find();

        // Short queries without pronouns or history are simple enough for rule-based expansion
        boolean isShort = trimmed.length() < minQueryLengthForLlm;
        if (isShort && !hasPronoun && !hasHistory) {
            return true;
        }

        // Keyword-style queries: no interrogative structure, no request prefix → skip LLM
        if (isKeywordStyleQuery(trimmed) && !hasPronoun && !hasHistory) {
            log.debug("Keyword-style query detected, using rule-based expansion: {}", trimmed);
            return true;
        }

        return false;
    }

    /**
     * A query is "keyword-style" if it lacks interrogative/question markers and
     * doesn't start with a request prefix. These queries are noun-phrase / keyword
     * searches where LLM rewriting adds latency without meaningful improvement.
     */
    private boolean isKeywordStyleQuery(String query) {
        if (query.length() > maxKeywordQueryLength) {
            return false;
        }
        if (INTERROGATIVE_PATTERN.matcher(query).find()) {
            return false;
        }
        if (REQUEST_PREFIX.matcher(query).find()) {
            return false;
        }
        return true;
    }

    private LlmRewriteResponse callLlmForRewrite(String query, List<SessionService.Turn> history) {
        List<LlmGatewayRequest.Message> messages = new ArrayList<>();
        messages.add(LlmGatewayRequest.Message.builder()
                .role("system")
                .content(REWRITE_SYSTEM_PROMPT)
                .build());

        StringBuilder userContent = new StringBuilder();
        if (history != null && !history.isEmpty()) {
            userContent.append("对话历史：\n");
            int start = Math.max(0, history.size() - 3);
            for (int i = start; i < history.size(); i++) {
                SessionService.Turn turn = history.get(i);
                userContent.append("- 用户：").append(turn.query()).append("\n");
                userContent.append("  助手：").append(truncateAnswer(turn.answer(), 100)).append("\n");
            }
            userContent.append("\n");
        }
        userContent.append("用户问题：").append(query);

        messages.add(LlmGatewayRequest.Message.builder()
                .role("user")
                .content(userContent.toString())
                .build());

        LlmGatewayRequest request = LlmGatewayRequest.builder()
                .model(rewriteModel)
                .messages(messages)
                .temperature(temperature)
                .maxTokens(maxTokens)
                .build();

        String rawResponse = llmGatewayClient.generate(request, "tr-rewrite-" + System.currentTimeMillis(), "system");
        return parseResponse(rawResponse);
    }

    LlmRewriteResponse parseResponse(String rawResponse) {
        if (rawResponse == null || rawResponse.trim().isEmpty()) {
            return null;
        }

        String json = rawResponse.trim();
        // Strip markdown code fences if present
        if (json.startsWith("```")) {
            int start = json.indexOf('\n');
            int end = json.lastIndexOf("```");
            if (start >= 0 && end > start) {
                json = json.substring(start + 1, end).trim();
            }
        }

        try {
            LlmRewriteResponse response = objectMapper.readValue(json, LlmRewriteResponse.class);
            if (response.getMainQuery() == null || response.getMainQuery().isEmpty()) {
                log.warn("LLM rewrite returned empty main_query, ignoring");
                return null;
            }
            if (response.getIntent() == null) {
                response.setIntent("POLICY_QA");
            }
            if (response.getKeywords() == null) {
                response.setKeywords(List.of());
            }
            if (response.getSubQueries() == null) {
                response.setSubQueries(List.of());
            }
            return response;
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse LLM rewrite response: {}", json.substring(0, Math.min(200, json.length())), e);
            return null;
        }
    }

    private String truncateAnswer(String answer, int maxChars) {
        if (answer == null || answer.length() <= maxChars) {
            return answer;
        }
        return answer.substring(0, maxChars) + "...";
    }

    private String buildCacheKey(String query, List<SessionService.Turn> history) {
        StringBuilder keyBuilder = new StringBuilder(query);
        if (history != null) {
            for (int i = Math.max(0, history.size() - 3); i < history.size(); i++) {
                keyBuilder.append("|").append(history.get(i).query());
            }
        }
        return CACHE_KEY_PREFIX + sha256(keyBuilder.toString());
    }

    private LlmRewriteResponse getCached(String cacheKey) {
        try {
            String json = stringRedisTemplate.opsForValue().get(cacheKey);
            if (json != null) {
                return objectMapper.readValue(json, LlmRewriteResponse.class);
            }
        } catch (JsonProcessingException e) {
            log.warn("Failed to deserialize cached rewrite: {}", e.getMessage());
        } catch (DataAccessException e) {
            log.warn("Redis unavailable while reading rewrite cache. Continue without cache: {}", e.getMessage());
        }
        return null;
    }

    private void cacheResult(String cacheKey, LlmRewriteResponse result) {
        try {
            stringRedisTemplate.opsForValue().set(
                    cacheKey,
                    objectMapper.writeValueAsString(result),
                    Duration.ofMinutes(cacheTtlMinutes));
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize rewrite for caching: {}", e.getMessage());
        } catch (DataAccessException e) {
            log.warn("Redis unavailable while writing rewrite cache. Continue without cache: {}", e.getMessage());
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

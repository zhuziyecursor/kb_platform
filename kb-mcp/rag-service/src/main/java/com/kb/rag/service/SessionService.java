package com.kb.rag.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kb.rag.dto.CitationDto;
import com.kb.rag.entity.RagMessage;
import com.kb.rag.entity.RagSession;
import com.kb.rag.repository.RagMessageRepository;
import com.kb.rag.repository.RagSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionService {

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RagSessionRepository sessionRepository;
    private final RagMessageRepository messageRepository;

    @Value("${app.session.ttl-seconds}")
    private int sessionTtlSeconds;

    @Value("${app.session.max-turns}")
    private int maxTurns;

    private static final String SESSION_KEY_PREFIX = "kb:session:";

    public record Turn(int turnNum, String query, String answer, long timestamp) {
        public Turn() { this(0, "", "", 0); }
    }

    public record SessionData(String sessionId, String tenantId, String userId,
                              List<Turn> turns, long createdAt, long lastActivityAt) {
        public SessionData() {
            this("", "", "", new ArrayList<>(), 0, 0);
        }
    }

    @Transactional
    public String createSession(String tenantId, String userId) {
        String sessionId = "s-" + UUID.randomUUID();
        Instant now = Instant.now();

        RagSession session = RagSession.builder()
                .id(sessionId)
                .tenantId(tenantId)
                .userId(userId)
                .title(null)
                .createdAt(now)
                .updatedAt(now)
                .build();
        sessionRepository.save(session);

        SessionData data = new SessionData(sessionId, tenantId, userId,
                new ArrayList<>(), now.toEpochMilli(), now.toEpochMilli());
        saveToRedis(sessionId, data);

        return sessionId;
    }

    public SessionData getSession(String sessionId, String tenantId) {
        SessionData cached = getFromRedis(sessionId);
        if (cached != null) {
            if (!tenantId.equals(cached.tenantId())) return null;
            return cached;
        }

        RagSession session = sessionRepository.findByIdAndTenantId(sessionId, tenantId).orElse(null);
        if (session == null) return null;

        List<RagMessage> messages = messageRepository.findBySessionIdOrderByCreatedAtAsc(sessionId);
        List<Turn> turns = rebuildTurns(messages);

        SessionData data = new SessionData(
                session.getId(), session.getTenantId(), session.getUserId(),
                turns,
                session.getCreatedAt().toEpochMilli(),
                session.getUpdatedAt().toEpochMilli()
        );
        saveToRedis(sessionId, data);
        return data;
    }

    @Transactional
    public void appendTurn(String sessionId, SessionData session, String query, String answer) {
        RagMessage userMsg = RagMessage.builder()
                .sessionId(sessionId)
                .tenantId(session.tenantId())
                .role("user")
                .content(query)
                .build();
        messageRepository.save(userMsg);

        RagMessage assistantMsg = RagMessage.builder()
                .sessionId(sessionId)
                .tenantId(session.tenantId())
                .role("assistant")
                .content(answer)
                .build();
        messageRepository.save(assistantMsg);

        if (session.turns().isEmpty()) {
            String title = query.length() > 30 ? query.substring(0, 30) + "..." : query;
            sessionRepository.updateTitle(sessionId, title);
        }

        List<Turn> turns = new ArrayList<>(session.turns());
        int turnNum = turns.size() + 1;
        turns.add(new Turn(turnNum, query, answer, System.currentTimeMillis()));
        if (turns.size() > maxTurns) {
            turns = turns.subList(turns.size() - maxTurns, turns.size());
        }

        SessionData updated = new SessionData(
                session.sessionId(), session.tenantId(), session.userId(),
                turns, session.createdAt(), System.currentTimeMillis()
        );
        saveToRedis(sessionId, updated);
    }

    @Transactional
    public Long appendTurnWithCitations(String sessionId, SessionData session, String query,
                                         String answer, List<CitationDto> citations, String traceId) {
        RagMessage userMsg = RagMessage.builder()
                .sessionId(sessionId)
                .tenantId(session.tenantId())
                .role("user")
                .content(query)
                .build();
        messageRepository.save(userMsg);

        String citationsJson = null;
        if (citations != null && !citations.isEmpty()) {
            try {
                citationsJson = objectMapper.writeValueAsString(citations);
            } catch (JsonProcessingException e) {
                log.warn("Failed to serialize citations: {}", e.getMessage());
            }
        }

        RagMessage assistantMsg = RagMessage.builder()
                .sessionId(sessionId)
                .tenantId(session.tenantId())
                .role("assistant")
                .content(answer)
                .citations(citationsJson)
                .traceId(traceId)
                .build();
        RagMessage saved = messageRepository.save(assistantMsg);

        if (session.turns().isEmpty()) {
            String title = query.length() > 30 ? query.substring(0, 30) + "..." : query;
            sessionRepository.updateTitle(sessionId, title);
        }

        List<Turn> turns = new ArrayList<>(session.turns());
        int turnNum = turns.size() + 1;
        turns.add(new Turn(turnNum, query, answer, System.currentTimeMillis()));
        if (turns.size() > maxTurns) {
            turns = turns.subList(turns.size() - maxTurns, turns.size());
        }

        SessionData updated = new SessionData(
                session.sessionId(), session.tenantId(), session.userId(),
                turns, session.createdAt(), System.currentTimeMillis()
        );
        saveToRedis(sessionId, updated);

        return saved.getId();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listSessions(String tenantId, String userId) {
        List<RagSession> sessions = sessionRepository.findByTenantIdAndUserIdOrderByUpdatedAtDesc(tenantId, userId);
        return sessions.stream().map(s -> {
            Map<String, Object> m = new HashMap<>();
            m.put("sessionId", s.getId());
            m.put("title", s.getTitle() != null ? s.getTitle() : "新对话");
            m.put("createdAt", s.getCreatedAt().toEpochMilli());
            m.put("updatedAt", s.getUpdatedAt().toEpochMilli());
            return m;
        }).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getMessages(String sessionId, String tenantId) {
        RagSession session = sessionRepository.findByIdAndTenantId(sessionId, tenantId).orElse(null);
        if (session == null) return Collections.emptyList();

        List<RagMessage> messages = messageRepository.findBySessionIdOrderByCreatedAtAsc(sessionId);
        return messages.stream().map(m -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", m.getId());
            map.put("role", m.getRole());
            map.put("content", m.getContent());
            map.put("citations", m.getCitations());
            map.put("traceId", m.getTraceId());
            map.put("createdAt", m.getCreatedAt().toEpochMilli());
            return map;
        }).collect(Collectors.toList());
    }

    @Transactional
    public void deleteSession(String sessionId, String tenantId) {
        sessionRepository.deleteByIdAndTenantId(sessionId, tenantId);
        stringRedisTemplate.delete(SESSION_KEY_PREFIX + sessionId);
    }

    private void saveToRedis(String sessionId, SessionData data) {
        String key = SESSION_KEY_PREFIX + sessionId;
        try {
            stringRedisTemplate.opsForValue().set(
                    key,
                    objectMapper.writeValueAsString(data),
                    Duration.ofSeconds(sessionTtlSeconds)
            );
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize session: {}", e.getMessage());
        }
    }

    private SessionData getFromRedis(String sessionId) {
        String key = SESSION_KEY_PREFIX + sessionId;
        String json = stringRedisTemplate.opsForValue().get(key);
        if (json == null) return null;
        try {
            return objectMapper.readValue(json, SessionData.class);
        } catch (JsonProcessingException e) {
            log.error("Failed to deserialize session: {}", e.getMessage());
            return null;
        }
    }

    private List<Turn> rebuildTurns(List<RagMessage> messages) {
        List<Turn> turns = new ArrayList<>();
        String lastQuery = null;
        for (RagMessage msg : messages) {
            if ("user".equals(msg.getRole())) {
                lastQuery = msg.getContent();
            } else if ("assistant".equals(msg.getRole()) && lastQuery != null) {
                turns.add(new Turn(turns.size() + 1, lastQuery, msg.getContent(),
                        msg.getCreatedAt().toEpochMilli()));
                lastQuery = null;
            }
        }
        return turns;
    }
}

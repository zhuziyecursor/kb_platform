package com.kb.rag.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionService {

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

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

    public String createSession(String tenantId, String userId) {
        String sessionId = "s-" + UUID.randomUUID();
        SessionData session = new SessionData(
                sessionId, tenantId, userId,
                new ArrayList<>(),
                System.currentTimeMillis(),
                System.currentTimeMillis()
        );
        saveSession(sessionId, session);
        return sessionId;
    }

    public SessionData getSession(String sessionId, String tenantId) {
        String key = SESSION_KEY_PREFIX + sessionId;
        String json = stringRedisTemplate.opsForValue().get(key);
        if (json == null) {
            return null;
        }
        try {
            SessionData session = objectMapper.readValue(json, SessionData.class);
            if (!tenantId.equals(session.tenantId())) {
                log.warn("Session tenantId mismatch: {} vs {}", tenantId, session.tenantId());
                return null;
            }
            return session;
        } catch (JsonProcessingException e) {
            log.error("Failed to deserialize session: {}", e.getMessage());
            return null;
        }
    }

    public void appendTurn(String sessionId, SessionData session, String query, String answer) {
        List<Turn> turns = new ArrayList<>(session.turns());
        int turnNum = turns.size() + 1;
        turns.add(new Turn(turnNum, query, answer, System.currentTimeMillis()));

        if (turns.size() > maxTurns) {
            turns = turns.subList(turns.size() - maxTurns, turns.size());
        }

        SessionData updated = new SessionData(
                session.sessionId(), session.tenantId(), session.userId(),
                turns,
                session.createdAt(),
                System.currentTimeMillis()
        );
        saveSession(sessionId, updated);
    }

    private void saveSession(String sessionId, SessionData session) {
        String key = SESSION_KEY_PREFIX + sessionId;
        try {
            stringRedisTemplate.opsForValue().set(
                    key,
                    objectMapper.writeValueAsString(session),
                    Duration.ofSeconds(sessionTtlSeconds)
            );
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize session: {}", e.getMessage());
        }
    }
}

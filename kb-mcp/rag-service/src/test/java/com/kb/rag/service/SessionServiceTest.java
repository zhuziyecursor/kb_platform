package com.kb.rag.service;

import com.kb.rag.entity.RagSession;
import com.kb.rag.repository.RagMessageRepository;
import com.kb.rag.repository.RagSessionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SessionServiceTest {

    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final RagSessionRepository sessionRepository = mock(RagSessionRepository.class);
    private final RagMessageRepository messageRepository = mock(RagMessageRepository.class);
    private final SessionService sessionService = new SessionService(
            redisTemplate,
            sessionRepository,
            messageRepository);

    SessionServiceTest() {
        ReflectionTestUtils.setField(sessionService, "sessionTtlSeconds", 1800);
        ReflectionTestUtils.setField(sessionService, "maxTurns", 10);
    }

    @Test
    void createSessionReturnsIdWhenRedisWriteFails() {
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOps = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        doThrow(new DataAccessResourceFailureException("redis down"))
                .when(valueOps).set(anyString(), anyString(), any());

        String sessionId = sessionService.createSession("dev-tenant-001", "current-user");

        assertThat(sessionId).startsWith("s-");
        verify(sessionRepository).save(argThat(session ->
                session.getId().equals(sessionId)
                        && session.getTenantId().equals("dev-tenant-001")
                        && session.getUserId().equals("current-user")));
    }

    @Test
    void getSessionFallsBackToDatabaseWhenRedisReadFails() {
        when(redisTemplate.opsForValue()).thenThrow(new DataAccessResourceFailureException("redis down"));
        when(sessionRepository.findByIdAndTenantId("s-1", "dev-tenant-001"))
                .thenReturn(Optional.of(RagSession.builder()
                        .id("s-1")
                        .tenantId("dev-tenant-001")
                        .userId("current-user")
                        .createdAt(java.time.Instant.now())
                        .updatedAt(java.time.Instant.now())
                        .build()));
        when(messageRepository.findBySessionIdOrderByCreatedAtAsc("s-1")).thenReturn(java.util.List.of());

        SessionService.SessionData session = sessionService.getSession("s-1", "dev-tenant-001");

        assertThat(session).isNotNull();
        assertThat(session.sessionId()).isEqualTo("s-1");
        assertThat(session.tenantId()).isEqualTo("dev-tenant-001");
    }
}

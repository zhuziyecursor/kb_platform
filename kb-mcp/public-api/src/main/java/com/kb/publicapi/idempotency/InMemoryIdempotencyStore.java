package com.kb.publicapi.idempotency;

import com.kb.publicapi.config.PublicApiProperties;
import com.kb.publicapi.dto.FileIngestResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class InMemoryIdempotencyStore implements IdempotencyStore {

    private final ConcurrentHashMap<String, IdempotencyRecord> store = new ConcurrentHashMap<>();
    private final PublicApiProperties properties;

    public InMemoryIdempotencyStore(PublicApiProperties properties) {
        this.properties = properties;
    }

    @Override
    public Optional<FileIngestResponse> get(String key) {
        IdempotencyRecord record = store.get(key);
        if (record == null) {
            return Optional.empty();
        }
        if (record.expiresAt.isBefore(Instant.now())) {
            store.remove(key);
            return Optional.empty();
        }
        return Optional.of(record.response);
    }

    @Override
    public void put(String key, FileIngestResponse response) {
        if (store.size() >= properties.getIdempotency().getMaxEntries()) {
            log.warn("Idempotency store reached max entries ({})", store.size());
        }
        Instant expiresAt = Instant.now().plus(properties.getIdempotency().getTtlHours(), ChronoUnit.HOURS);
        store.put(key, new IdempotencyRecord(response, expiresAt));
    }

    @Override
    @Scheduled(fixedDelay = 300_000)
    public void evictExpired() {
        Instant now = Instant.now();
        store.entrySet().removeIf(entry -> entry.getValue().expiresAt.isBefore(now));
    }

    private record IdempotencyRecord(FileIngestResponse response, Instant expiresAt) {
    }
}

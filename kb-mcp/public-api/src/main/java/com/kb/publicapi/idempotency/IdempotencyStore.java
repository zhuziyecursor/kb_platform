package com.kb.publicapi.idempotency;

import com.kb.publicapi.dto.FileIngestResponse;

import java.util.Optional;

public interface IdempotencyStore {

    Optional<FileIngestResponse> get(String key);

    void put(String key, FileIngestResponse response);

    void evictExpired();
}

package com.kb.publicapi.service;

import com.kb.publicapi.config.PublicApiProperties;
import com.kb.publicapi.dto.FileIngestResponse;
import com.kb.publicapi.idempotency.InMemoryIdempotencyStore;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FileIngestServiceTest {

    @Test
    void idempotencyStoreReturnsCachedResponse() {
        PublicApiProperties props = new PublicApiProperties();
        props.getIdempotency().setTtlHours(24);
        props.getIdempotency().setMaxEntries(10000);

        InMemoryIdempotencyStore store = new InMemoryIdempotencyStore(props);

        String key = "pk-test:my-idem-key";
        FileIngestResponse response = FileIngestResponse.builder()
                .docId("DOC-TEST001")
                .version(1)
                .status("PROCESSING")
                .build();

        assertThat(store.get(key)).isEmpty();

        store.put(key, response);
        assertThat(store.get(key)).isPresent();
        assertThat(store.get(key).get().getDocId()).isEqualTo("DOC-TEST001");
    }

    @Test
    void idempotencyStoreEvictsExpired() {
        PublicApiProperties props = new PublicApiProperties();
        props.getIdempotency().setTtlHours(0); // immediate expiry
        props.getIdempotency().setMaxEntries(10000);

        InMemoryIdempotencyStore store = new InMemoryIdempotencyStore(props);

        String key = "pk-test:expired-key";
        store.put(key, FileIngestResponse.builder().docId("DOC-EXPIRED").build());

        // TTL of 0 means it should already be expired
        assertThat(store.get(key)).isEmpty();
    }
}

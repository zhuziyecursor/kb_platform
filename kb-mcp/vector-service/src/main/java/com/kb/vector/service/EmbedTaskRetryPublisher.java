package com.kb.vector.service;

import com.kb.vector.dto.EmbedTaskRetryRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

/**
 * Publishes embed-task retry requests when reconcile detects PG-only chunks.
 * The consumer side (kb-doc-processor) owns embedding regeneration.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmbedTaskRetryPublisher {

    private final KafkaTemplate<String, Object> reprocessKafkaTemplate;

    @Value("${app.kafka.embed-task-retry-topic:embed-task-retry}")
    private String topic;

    public boolean publish(EmbedTaskRetryRequest request) {
        try {
            String key = request.getTenantId() + "|" + request.getDocId() + "|"
                    + request.getVersion() + "|" + request.getChunkSeq();
            reprocessKafkaTemplate.send(topic, key, request);
            log.info("embed-task-retry published key={} reason={}", key, request.getReason());
            return true;
        } catch (Exception e) {
            log.warn("Failed to publish embed-task-retry for {}|{}|{}: {}",
                    request.getDocId(), request.getVersion(), request.getChunkSeq(), e.getMessage());
            return false;
        }
    }
}

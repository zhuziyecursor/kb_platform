package com.kb.vector.service;

import com.kb.vector.dto.EmbedTaskMessage;
import com.kb.vector.repository.EmbedTaskRepository;
import com.kb.vector.repository.KnowledgeDocRepository;
import com.kb.vector.repository.KnowledgeVersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmbedTaskConsumer {

    private final MilvusService milvusService;
    private final EmbedTaskRepository embedTaskRepository;
    private final KnowledgeVersionRepository versionRepository;
    private final KnowledgeDocRepository docRepository;

    @KafkaListener(
        topics = "${app.kafka.embed-task-topic:embed-task}",
        groupId = "${spring.kafka.consumer.group-id:vector-service}",
        containerFactory = "batchFactory"
    )
    @Transactional
    public void consume(List<EmbedTaskMessage> messages, Acknowledgment ack) {
        int originalSize = messages.size();
        messages = messages.stream().filter(Objects::nonNull).toList();
        if (messages.size() != originalSize) {
            log.warn("Skipped {} null embed-task messages after deserialization failure",
                    originalSize - messages.size());
        }

        if (messages.isEmpty()) {
            ack.acknowledge();
            return;
        }

        EmbedTaskMessage first = messages.get(0);
        log.info("Received batch of {} embed-task messages: docId={}, traceId={}",
                messages.size(), first.getDocId(), first.getTraceId());

        try {
            List<Long> milvusPks = milvusService.upsert(messages);
            log.info("Milvus upsert completed: {} rows", milvusPks.size());

            LocalDateTime now = LocalDateTime.now();

            for (int i = 0; i < messages.size(); i++) {
                EmbedTaskMessage msg = messages.get(i);
                Long milvusPk = i < milvusPks.size() ? milvusPks.get(i) : null;

                embedTaskRepository.markDone(
                        msg.getTenantId(), msg.getDocId(), msg.getVersion(),
                        msg.getChunkSeq(), msg.getTextHash(),
                        milvusPk, now, now, "DONE");
            }

            updateVersionStatusIfAllDone(messages);
            ack.acknowledge();

        } catch (Exception e) {
            log.error("Batch failed, marking {} messages as FAILED: {}", messages.size(), e.getMessage());
            for (EmbedTaskMessage msg : messages) {
                markFailed(msg, "MILVUS_UPSERT_FAILED", e.getMessage());
            }
            markDocumentFailed(first, "MILVUS_UPSERT_FAILED", e.getMessage());
            ack.acknowledge();
        }
    }

    @Transactional
    private void markFailed(EmbedTaskMessage msg, String errorCode, String errorMsg) {
        try {
            embedTaskRepository.markFailed(
                    msg.getTenantId(), msg.getDocId(), msg.getVersion(),
                    msg.getChunkSeq(), msg.getTextHash(),
                    "FAILED", errorCode, errorMsg, LocalDateTime.now());
        } catch (Exception ex) {
            log.error("Failed to mark embed_task as FAILED: {}", ex.getMessage());
        }
    }

    private void markDocumentFailed(EmbedTaskMessage msg, String errorCode, String errorMsg) {
        try {
            versionRepository.updateStatus(msg.getTenantId(), msg.getDocId(), msg.getVersion(), "FAILED");
            docRepository.updateStatus(msg.getTenantId(), msg.getDocId(), msg.getVersion(), "FAILED");
            log.error("knowledge_version + knowledge_doc marked FAILED: docId={}, version={}, errorCode={}, error={}",
                    msg.getDocId(), msg.getVersion(), errorCode, errorMsg);
        } catch (Exception ex) {
            log.error("Failed to mark document as FAILED: docId={}, version={}, error={}",
                    msg.getDocId(), msg.getVersion(), ex.getMessage());
        }
    }

    private void updateVersionStatusIfAllDone(List<EmbedTaskMessage> messages) {
        EmbedTaskMessage first = messages.get(0);
        String tenantId = first.getTenantId();
        String docId = first.getDocId();
        Integer version = first.getVersion();

        long remaining = embedTaskRepository.countByTenantIdAndDocIdAndVersionAndStatusNot(
                tenantId, docId, version, "DONE");

        if (remaining == 0) {
            versionRepository.updateStatus(tenantId, docId, version, "READY");
            docRepository.updateStatus(tenantId, docId, version, "READY");
            log.info("All chunks DONE — knowledge_version + knowledge_doc updated to READY: docId={}, version={}",
                    docId, version);
        } else {
            versionRepository.updateStatus(tenantId, docId, version, "PROCESSING");
        }
    }
}

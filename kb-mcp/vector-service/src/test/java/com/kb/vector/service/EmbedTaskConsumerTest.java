package com.kb.vector.service;

import com.kb.vector.dto.EmbedTaskMessage;
import com.kb.vector.repository.EmbedTaskRepository;
import com.kb.vector.repository.KnowledgeDocRepository;
import com.kb.vector.repository.KnowledgeVersionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.support.Acknowledgment;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmbedTaskConsumerTest {

    @Test
    void marksDocumentFailedWhenMilvusUpsertFails() {
        MilvusService milvusService = mock(MilvusService.class);
        EmbedTaskRepository embedTaskRepository = mock(EmbedTaskRepository.class);
        KnowledgeVersionRepository versionRepository = mock(KnowledgeVersionRepository.class);
        KnowledgeDocRepository docRepository = mock(KnowledgeDocRepository.class);
        Acknowledgment ack = mock(Acknowledgment.class);

        EmbedTaskConsumer consumer = new EmbedTaskConsumer(
                milvusService, embedTaskRepository, versionRepository, docRepository);

        EmbedTaskMessage msg = new EmbedTaskMessage();
        msg.setTenantId("tenant-1");
        msg.setDocId("doc-1");
        msg.setVersion(1);
        msg.setChunkSeq(0);
        msg.setTextHash("hash-1");
        msg.setTraceId("tr-test");

        when(milvusService.upsert(List.of(msg))).thenThrow(new RuntimeException("milvus down"));

        consumer.consume(List.of(msg), ack);

        verify(embedTaskRepository).markFailed(
                eq("tenant-1"), eq("doc-1"), eq(1), eq(0), eq("hash-1"),
                eq("FAILED"), eq("MILVUS_UPSERT_FAILED"), eq("milvus down"), any(LocalDateTime.class));
        verify(versionRepository).updateStatus("tenant-1", "doc-1", 1, "FAILED");
        verify(docRepository).updateStatus("tenant-1", "doc-1", 1, "FAILED");
        verify(ack).acknowledge();
    }
}

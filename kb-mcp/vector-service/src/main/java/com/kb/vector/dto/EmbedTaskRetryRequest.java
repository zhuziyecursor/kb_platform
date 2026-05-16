package com.kb.vector.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Reprocess request published by {@code ReconcileJob} when PG holds a chunk
 * key that is missing in Milvus. kb-doc-processor is expected to listen on
 * {@code embed-task-retry} and re-emit a full embed-task message
 * (text + freshly computed embedding) for the requested key.
 *
 * <p>vector-service cannot regenerate embeddings itself (per service rules),
 * so the only safe self-heal channel is to ask the upstream owner to retry.</p>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmbedTaskRetryRequest {
    private String traceId;
    private String tenantId;
    private String docId;
    private Integer version;
    private Integer chunkSeq;
    private String reason;
}

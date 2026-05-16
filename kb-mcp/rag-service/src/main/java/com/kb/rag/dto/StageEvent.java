package com.kb.rag.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * One frame of the retrieval "thinking chain" streamed to the client over SSE
 * (event: stage) before LLM tokens begin.
 *
 * summary fields per stage are documented in contracts/openapi/rag-service-v1.yaml.
 * Chunk text is never included — only counts, IDs, and aggregated metadata.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StageEvent {

    /** Stage key matching PipelineTraceService stage names (e.g. "query_plan", "milvus_search"). */
    private String stage;

    /** "SUCCESS" | "ERROR" | "SKIPPED" — RUNNING state is inferred client-side. */
    private String status;

    /** Wall-clock duration of this stage in ms. */
    private long durationMs;

    /** Cumulative ms since request start. */
    private long elapsedMs;

    /** Stage-specific summary fields (small, safe to render directly). */
    private Map<String, Object> summary;
}

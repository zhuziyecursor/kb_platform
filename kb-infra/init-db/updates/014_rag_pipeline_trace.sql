-- RAG Pipeline observability trace table

CREATE TABLE IF NOT EXISTS kb_audit.rag_pipeline_trace (
    id                  BIGSERIAL PRIMARY KEY,
    trace_id            VARCHAR(128) NOT NULL UNIQUE,
    tenant_id           VARCHAR(64) NOT NULL,
    uid                 VARCHAR(64) NOT NULL,
    session_id          VARCHAR(128),
    query_text          TEXT,
    rewritten_query     TEXT,
    space_id            VARCHAR(128),
    lang                VARCHAR(16) NOT NULL DEFAULT 'zh',
    cache_hit           BOOLEAN NOT NULL DEFAULT false,
    stream              BOOLEAN NOT NULL DEFAULT false,
    result              VARCHAR(32) NOT NULL,
    refusal_reason      VARCHAR(64),
    total_ms            BIGINT NOT NULL DEFAULT 0,
    first_token_ms      BIGINT,
    stage_timings       JSONB NOT NULL DEFAULT '[]'::jsonb,
    recall_count        INT NOT NULL DEFAULT 0,
    acl_filtered_count  INT NOT NULL DEFAULT 0,
    rerank_count        INT NOT NULL DEFAULT 0,
    citations_count     INT NOT NULL DEFAULT 0,
    hit_docs            JSONB NOT NULL DEFAULT '[]'::jsonb,
    prompt_budget       JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message       TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_pipeline_trace_tenant_created
    ON kb_audit.rag_pipeline_trace (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_pipeline_trace_session
    ON kb_audit.rag_pipeline_trace (tenant_id, session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rag_pipeline_trace_result
    ON kb_audit.rag_pipeline_trace (tenant_id, result, created_at DESC);

COMMENT ON TABLE kb_audit.rag_pipeline_trace IS 'RAG 问答 Pipeline 可观测性记录，按 trace_id 聚合阶段耗时和召回指标';
COMMENT ON COLUMN kb_audit.rag_pipeline_trace.stage_timings IS '阶段耗时数组: [{stage,status,durationMs,errorMessage,metadata}]';
COMMENT ON COLUMN kb_audit.rag_pipeline_trace.hit_docs IS '最终引用文档摘要数组: [{docId,title,score,version,page}]';
COMMENT ON COLUMN kb_audit.rag_pipeline_trace.prompt_budget IS 'Prompt预算统计: {enabled,inputBudgetTokens,estimatedPromptTokens,includedCitations,droppedCitations,truncatedCitations,includedHistoryTurns,droppedHistoryTurns}';

-- Persist prompt token budget stats in RAG pipeline traces.

ALTER TABLE IF EXISTS kb_audit.rag_pipeline_trace
    ADD COLUMN IF NOT EXISTS prompt_budget JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN kb_audit.rag_pipeline_trace.prompt_budget IS
    'Prompt预算统计: {enabled,inputBudgetTokens,estimatedPromptTokens,includedCitations,droppedCitations,truncatedCitations,includedHistoryTurns,droppedHistoryTurns}';

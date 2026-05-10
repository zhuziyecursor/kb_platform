-- =============================================================================
-- 授予 kb_rag 用户访问 kb_audit schema 的权限
-- rag_pipeline_trace 表用于 RAG Pipeline 可观测性记录
-- =============================================================================

-- kb_rag 对 kb_audit schema 的权限
GRANT USAGE ON SCHEMA kb_audit TO kb_rag;
GRANT SELECT, INSERT ON kb_audit.rag_pipeline_trace TO kb_rag;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_audit TO kb_rag;

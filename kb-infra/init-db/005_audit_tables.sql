-- =============================================================================
-- 审计日志 - 搜索审计
-- =============================================================================

-- 知识库搜索审计
CREATE TABLE kb_audit.kb_search_audit (
    id          BIGSERIAL   PRIMARY KEY,
    ts          TIMESTAMP   NOT NULL DEFAULT now(),
    trace_id    VARCHAR(128),
    tenant_id   VARCHAR(64) NOT NULL,
    uid         VARCHAR(64) NOT NULL,
    app_id      VARCHAR(128),
    workflow_id VARCHAR(128),
    query_text  TEXT,
    topk        INT,
    denied_ids  TEXT,
    result      VARCHAR(16) NOT NULL
);

CREATE INDEX idx_search_audit_tenant_ts ON kb_audit.kb_search_audit (tenant_id, ts);
CREATE INDEX idx_search_audit_uid_ts    ON kb_audit.kb_search_audit (uid, ts);

COMMENT ON TABLE kb_audit.kb_search_audit IS 'RAG 搜索审计: 记录每次检索的 trace_id, denied_ids 等';
COMMENT ON COLUMN kb_audit.kb_search_audit.result IS 'SUCCESS/PARTIAL_DENIED/FULL_DENIED/ERROR';

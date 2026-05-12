-- =============================================================================
-- RAG 反馈闭环 — 用户反馈表 + Badcase 归档表
-- rag-service 拥有，写入 kb_audit schema
-- =============================================================================

-- 用户反馈表（每次问答最多一条反馈，按 trace_id 唯一）
CREATE TABLE IF NOT EXISTS kb_audit.rag_feedback (
    id              BIGSERIAL PRIMARY KEY,
    trace_id        VARCHAR(128) NOT NULL,
    tenant_id       VARCHAR(64) NOT NULL,
    uid             VARCHAR(64) NOT NULL,
    session_id      VARCHAR(128),
    message_id      BIGINT,
    feedback_type   VARCHAR(16) NOT NULL CHECK (feedback_type IN ('LIKE', 'DISLIKE', 'REPORT')),
    report_reason   VARCHAR(32) CHECK (report_reason IN ('HALLUCINATION', 'WRONG_CITATION', 'IRRELEVANT', 'OTHER')),
    comment         TEXT,
    confidence      VARCHAR(8),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uk_rag_feedback_trace UNIQUE (trace_id)
);

CREATE INDEX idx_rag_feedback_tenant_created
    ON kb_audit.rag_feedback (tenant_id, created_at DESC);

COMMENT ON TABLE kb_audit.rag_feedback IS 'RAG 问答用户反馈，按 trace_id 唯一';
COMMENT ON COLUMN kb_audit.rag_feedback.feedback_type IS 'LIKE=点赞, DISLIKE=点踩, REPORT=报错';
COMMENT ON COLUMN kb_audit.rag_feedback.report_reason IS 'HALLUCINATION=幻觉, WRONG_CITATION=引用不准, IRRELEVANT=不相关, OTHER=其他';
COMMENT ON COLUMN kb_audit.rag_feedback.confidence IS 'LLM 自评置信度 HIGH/MEDIUM/LOW';

-- Badcase 归档表（DISLIKE/REPORT 反馈自动写入）
CREATE TABLE IF NOT EXISTS kb_audit.badcase_archive (
    id              BIGSERIAL PRIMARY KEY,
    feedback_id     BIGINT NOT NULL REFERENCES kb_audit.rag_feedback(id),
    trace_id        VARCHAR(128) NOT NULL,
    tenant_id       VARCHAR(64) NOT NULL,
    session_id      VARCHAR(128),
    query_text      TEXT NOT NULL,
    rewritten_query TEXT,
    answer          TEXT NOT NULL,
    citations       JSONB,
    feedback_type   VARCHAR(16) NOT NULL,
    report_reason   VARCHAR(32),
    comment         TEXT,
    trace_summary   JSONB,
    status          VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED')),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_badcase_archive_tenant_status
    ON kb_audit.badcase_archive (tenant_id, status, created_at DESC);

CREATE INDEX idx_badcase_archive_trace
    ON kb_audit.badcase_archive (trace_id);

COMMENT ON TABLE kb_audit.badcase_archive IS 'RAG Badcase 归档，用户点踩/报错后自动从 rag_feedback + rag_pipeline_trace + rag_message 归档';
COMMENT ON COLUMN kb_audit.badcase_archive.trace_summary IS '脱敏后的 pipeline trace 摘要: {totalMs, recallCount, citationsCount, refusalReason, result}';
COMMENT ON COLUMN kb_audit.badcase_archive.status IS 'OPEN=待评审, REVIEWED=已评审, RESOLVED=已解决, DISMISSED=已忽略';

-- 授予 kb_rag 读写权限
GRANT SELECT, INSERT, UPDATE ON kb_audit.rag_feedback TO kb_rag;
GRANT SELECT, INSERT, UPDATE ON kb_audit.badcase_archive TO kb_rag;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_audit TO kb_rag;

-- =============================================================================
-- RAG 会话持久化 — 会话与消息表
-- rag-service 拥有这两张表，负责读写
-- =============================================================================

-- 会话主表
CREATE TABLE kb_knowledge.rag_session (
    id          VARCHAR(64) PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    title       VARCHAR(256),
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_rag_session_tenant_user ON kb_knowledge.rag_session(tenant_id, user_id);

COMMENT ON TABLE kb_knowledge.rag_session IS 'RAG 会话主表，rag-service 拥有';
COMMENT ON COLUMN kb_knowledge.rag_session.title IS '会话标题，默认取首条用户消息前30字';

-- 消息表
CREATE TABLE kb_knowledge.rag_message (
    id          BIGSERIAL PRIMARY KEY,
    session_id  VARCHAR(64) NOT NULL REFERENCES kb_knowledge.rag_session(id) ON DELETE CASCADE,
    tenant_id   VARCHAR(64) NOT NULL,
    role        VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    citations   JSONB,
    trace_id    VARCHAR(64),
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_rag_msg_session ON kb_knowledge.rag_message(session_id);

COMMENT ON TABLE kb_knowledge.rag_message IS 'RAG 会话消息表，rag-service 拥有';
COMMENT ON COLUMN kb_knowledge.rag_message.citations IS 'JSON 数组，存储 CitationDto 列表';

-- rag-service 对自有表的完整权限
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.rag_session TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.rag_message TO kb_rag;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_rag;

-- rag-service 对 knowledge_doc 和 knowledge_space 的只读权限（用于 spacePath 解析 & 检索范围过滤）
GRANT SELECT ON kb_knowledge.knowledge_doc TO kb_rag;
GRANT SELECT ON kb_knowledge.knowledge_space TO kb_rag;

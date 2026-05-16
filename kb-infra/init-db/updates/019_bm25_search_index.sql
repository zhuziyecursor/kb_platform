-- 019_bm25_search_index.sql
-- BM25 关键词检索索引表：存储分块文本的 tsvector 索引，用于 BM25 关键词检索
-- Phase 2 原型方案：PostgreSQL tsvector 全文检索

BEGIN;

-- 创建全文检索索引表
CREATE TABLE kb_knowledge.knowledge_search_idx (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    doc_id          VARCHAR(128) NOT NULL,
    version         INT         NOT NULL,
    chunk_seq       INT         NOT NULL,
    title           VARCHAR(256),
    text_snippet    TEXT        NOT NULL,
    tokens          TSVECTOR    NOT NULL,
    created_at      TIMESTAMP   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uk_search_idx_doc_chunk
    ON kb_knowledge.knowledge_search_idx (tenant_id, doc_id, version, chunk_seq);

-- GIN 索引加速 tsvector 全文检索
CREATE INDEX idx_search_idx_tokens_gin
    ON kb_knowledge.knowledge_search_idx USING GIN (tokens);

-- 租户过滤索引
CREATE INDEX idx_search_idx_tenant
    ON kb_knowledge.knowledge_search_idx (tenant_id);

COMMENT ON TABLE kb_knowledge.knowledge_search_idx IS 'BM25 全文检索索引表。存储分块文本的 tsvector，支持条款编号、专有名词等关键词精确检索。';
COMMENT ON COLUMN kb_knowledge.knowledge_search_idx.tokens IS 'jieba 分词后的 tsvector（simple 配置）';

-- 授予 kb_rag 只读权限
GRANT SELECT ON kb_knowledge.knowledge_search_idx TO kb_rag;

-- 授予 kb_vector 写入权限（在 embed_task 消费侧写入索引）
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.knowledge_search_idx TO kb_vector;
GRANT USAGE, SELECT ON SEQUENCE kb_knowledge.knowledge_search_idx_id_seq TO kb_vector;

COMMIT;

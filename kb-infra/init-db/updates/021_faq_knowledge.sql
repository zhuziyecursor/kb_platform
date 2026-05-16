-- 021_faq_knowledge.sql
-- FAQ 知识库表：高频问题预置答案，支持高置信度短路 (A.2)

BEGIN;

CREATE TABLE kb_knowledge.faq_knowledge (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    question        TEXT        NOT NULL,
    answer          TEXT        NOT NULL,
    embedding_json  TEXT,
    space_id        VARCHAR(128),
    hit_count       BIGINT      NOT NULL DEFAULT 0,
    created_at      TIMESTAMP   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE INDEX idx_faq_tenant ON kb_knowledge.faq_knowledge (tenant_id);

COMMENT ON TABLE kb_knowledge.faq_knowledge IS 'FAQ 高频问题预置答案。query 向量嵌入匹配 score > 阈值时直接返回，不走完整 RAG。';
COMMENT ON COLUMN kb_knowledge.faq_knowledge.embedding_json IS '问题文本的向量嵌入，JSON 浮点数组格式，用于余弦相似度匹配';
COMMENT ON COLUMN kb_knowledge.faq_knowledge.hit_count IS '命中次数，用于排序和淘汰低频 FAQ';

-- 授予 kb_rag CRUD 权限
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.faq_knowledge TO kb_rag;
GRANT USAGE, SELECT ON SEQUENCE kb_knowledge.faq_knowledge_id_seq TO kb_rag;

-- 示例数据
INSERT INTO kb_knowledge.faq_knowledge (tenant_id, question, answer, space_id)
VALUES ('dev-tenant-001', '什么是内部控制', '内部控制是企业为实现经营目标、保障资产安全、确保财务信息可靠性和合规性而建立的一系列政策、流程和控制措施。主要包括控制环境、风险评估、控制活动、信息与沟通、监督五大要素。', 'DEFAULT');

COMMIT;

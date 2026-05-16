-- 023_faq_knowledge_acl.sql
-- FAQ 表补齐 ACL 字段 + embedding_model，用于 FAQ 通道的权限过滤和模型升级检测

BEGIN;

ALTER TABLE kb_knowledge.faq_knowledge
    ADD COLUMN IF NOT EXISTS sec_level       INT          NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS perm_group_id   BIGINT       NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS effective_to    DATE,
    ADD COLUMN IF NOT EXISTS region_code     VARCHAR(32)  NOT NULL DEFAULT 'CN-NATIONAL',
    ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(64)  NOT NULL DEFAULT 'BGE-zh-v1.5';

COMMENT ON COLUMN kb_knowledge.faq_knowledge.sec_level IS '密级 1-5，控制 FAQ 回答可见性';
COMMENT ON COLUMN kb_knowledge.faq_knowledge.perm_group_id IS '权限组 ID';
COMMENT ON COLUMN kb_knowledge.faq_knowledge.embedding_model IS '生成 embedding_json 所用模型名称，模型升级后用于失效检测';

COMMIT;

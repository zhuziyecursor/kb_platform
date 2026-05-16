-- 022_search_idx_acl_fields.sql
-- 为 knowledge_search_idx 补齐 ACL 字段，消除 BM25-only 结果的越权风险
-- 保守默认值：sec_level=5（最高密级）、perm_group_id=0（无人匹配）
-- 回填脚本必须把真实 ACL 值填上，否则历史数据全部不可检索（优于"全部可见"的失败模式）

BEGIN;

ALTER TABLE kb_knowledge.knowledge_search_idx
    ADD COLUMN IF NOT EXISTS sec_level     INT         NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS perm_group_id BIGINT      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS effective_to  DATE,
    ADD COLUMN IF NOT EXISTS region_code   VARCHAR(32) NOT NULL DEFAULT '';

COMMENT ON COLUMN kb_knowledge.knowledge_search_idx.sec_level IS '密级 1-5，回填时从 knowledge_doc 或 embed-task 消息复制，默认 5（最严格）';
COMMENT ON COLUMN kb_knowledge.knowledge_search_idx.perm_group_id IS '权限组 ID，回填时从 doc_acl 解析，默认 0（无人匹配）';
COMMENT ON COLUMN kb_knowledge.knowledge_search_idx.effective_to IS '文档失效日期，NULL 表示永久有效';
COMMENT ON COLUMN kb_knowledge.knowledge_search_idx.region_code IS '地域码';

CREATE INDEX IF NOT EXISTS idx_search_idx_acl
    ON kb_knowledge.knowledge_search_idx (tenant_id, perm_group_id, sec_level);

COMMIT;

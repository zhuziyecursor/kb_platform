-- 014_parent_child_schema.sql
-- Parent-Children 双层分块支持：embed_task 表新增 parent_ref 和 is_parent 字段
-- 同时创建 parent_ref 索引用于回捞查询

BEGIN;

-- 新增 parent_ref 字段：格式 "doc_id/version/parent_seq"，无 Parent 时为空字符串
ALTER TABLE kb_knowledge.embed_task
    ADD COLUMN parent_ref VARCHAR(128) NOT NULL DEFAULT '';

-- 新增 is_parent 字段：标记该 chunk 是否为 Parent chunk
ALTER TABLE kb_knowledge.embed_task
    ADD COLUMN is_parent BOOLEAN NOT NULL DEFAULT FALSE;

-- Parent 回捞索引：按 parent_ref 快速查找 Parent 完整文本
CREATE INDEX idx_embed_task_parent_ref
    ON kb_knowledge.embed_task(parent_ref)
    WHERE parent_ref != '';

-- 向后兼容注释
COMMENT ON COLUMN kb_knowledge.embed_task.parent_ref IS 'Parent chunk 引用，格式: doc_id/version/parent_seq。无 Parent 时为空字符串。单层 chunk 也为空。';
COMMENT ON COLUMN kb_knowledge.embed_task.is_parent IS '是否为 Parent chunk。Parent 包含完整语义单元（一条款/一节）用于生成上下文。';

COMMIT;

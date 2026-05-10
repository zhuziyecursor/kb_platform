-- =============================================================================
-- 为 knowledge_space 表添加 smart_parse_enabled 字段
-- 控制该空间是否启用智能解析（规则引擎 + LLM 精修双层架构）
-- =============================================================================

ALTER TABLE kb_knowledge.knowledge_space
ADD COLUMN smart_parse_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN kb_knowledge.knowledge_space.smart_parse_enabled IS '是否启用智能解析：true=使用规则引擎+LLM精修双层架构，false=使用传统固定分片';

-- 现有空间默认不启用智能解析（保持向后兼容）
UPDATE kb_knowledge.knowledge_space SET smart_parse_enabled = false;

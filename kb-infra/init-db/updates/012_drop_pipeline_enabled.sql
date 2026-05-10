-- =============================================================================
-- 从 knowledge_space 表移除 pipeline_enabled 字段
-- 所有文档默认走解析/切片/向量化流水线，不再提供仅存储到 MinIO 的选项
-- =============================================================================

ALTER TABLE kb_knowledge.knowledge_space
DROP COLUMN IF EXISTS pipeline_enabled;

-- =============================================================================
-- 为 knowledge_space 表添加 pipeline_enabled 字段
-- 控制该空间内上传的文档是否触发解析/切片/向量化流水线
-- =============================================================================

ALTER TABLE kb_knowledge.knowledge_space
ADD COLUMN pipeline_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN kb_knowledge.knowledge_space.pipeline_enabled IS '是否启用文件处理流水线：true=上传后解析切片向量化，false=仅存储到MinIO';

-- 现有空间默认启用流水线（保持向后兼容）
UPDATE kb_knowledge.knowledge_space SET pipeline_enabled = true;

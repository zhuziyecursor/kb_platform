-- =============================================================================
-- 知识空间管理 - Knowledge Space
-- 用于组织文档，支持切片规则配置
-- =============================================================================

-- 知识空间表
CREATE TABLE kb_knowledge.knowledge_space (
    id              VARCHAR(64)  PRIMARY KEY,
    tenant_id       VARCHAR(64)  NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     VARCHAR(512),
    chunk_size      INT          NOT NULL DEFAULT 512,
    overlap_ratio   INT          NOT NULL DEFAULT 10,
    chunk_mode      VARCHAR(16)  NOT NULL DEFAULT 'HEAD_FIRST',
    visibility      VARCHAR(16)  NOT NULL DEFAULT 'TEAM',
    create_time     TIMESTAMP    NOT NULL DEFAULT now(),
    update_time     TIMESTAMP    NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

CREATE INDEX idx_space_tenant ON kb_knowledge.knowledge_space (tenant_id);
CREATE INDEX idx_space_visibility ON kb_knowledge.knowledge_space (tenant_id, visibility);

COMMENT ON TABLE kb_knowledge.knowledge_space IS '知识空间：组织文档的容器，支持切片规则配置';
COMMENT ON COLUMN kb_knowledge.knowledge_space.chunk_size IS '段长度，100-2000字符';
COMMENT ON COLUMN kb_knowledge.knowledge_space.overlap_ratio IS '相邻块重叠比例，0-50%';
COMMENT ON COLUMN kb_knowledge.knowledge_space.chunk_mode IS 'HEAD_FIRST：从前往后/TAIL_FIRST：从后往前/UNIFORM：均匀';
COMMENT ON COLUMN kb_knowledge.knowledge_space.visibility IS 'PUBLIC：公开/TEAM：团队内';

-- 向 knowledge_doc 表添加 knowledge_space_id 列
ALTER TABLE kb_knowledge.knowledge_doc
ADD COLUMN knowledge_space_id VARCHAR(64) NOT NULL DEFAULT 'DEFAULT';

CREATE INDEX idx_doc_space ON kb_knowledge.knowledge_doc (tenant_id, knowledge_space_id);

COMMENT ON COLUMN kb_knowledge.knowledge_doc.knowledge_space_id IS '所属知识空间ID，DEFAULT为系统内置默认空间';

-- 创建系统内置默认空间（所有未指定空间的文档归属此空间）
INSERT INTO kb_knowledge.knowledge_space (id, tenant_id, name, description, visibility)
VALUES ('DEFAULT', '_system', '默认空间', '系统内置默认空间，所有未指定知识空间的文档自动归属此处', 'TEAM')
ON CONFLICT (tenant_id, name) DO NOTHING;

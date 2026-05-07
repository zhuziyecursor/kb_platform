-- =============================================================================
-- 知识空间层级化改造 — 自引用树 + 物化路径
-- =============================================================================

-- 1. 新增列
ALTER TABLE kb_knowledge.knowledge_space
    ADD COLUMN IF NOT EXISTS parent_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS node_path TEXT NOT NULL DEFAULT '/',
    ADD COLUMN IF NOT EXISTS depth     INT  NOT NULL DEFAULT 0;

COMMENT ON COLUMN kb_knowledge.knowledge_space.parent_id IS '父节点ID，NULL表示根节点';
COMMENT ON COLUMN kb_knowledge.knowledge_space.node_path IS '物化路径，如 /root_id/child_id/，支持子树前缀查询';
COMMENT ON COLUMN kb_knowledge.knowledge_space.depth     IS '层级深度，根节点为0';

-- 2. 新增索引
CREATE INDEX IF NOT EXISTS idx_space_parent ON kb_knowledge.knowledge_space(tenant_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_space_path   ON kb_knowledge.knowledge_space(tenant_id, node_path);

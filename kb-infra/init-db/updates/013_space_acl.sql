-- =====================================================
-- 013: 知识空间权限绑定表 (space_acl)
-- 用于角色与知识空间的权限绑定，支持 READ/WRITE/ADMIN 三级权限
-- cascade 逻辑：space_acl 中的 ROLE 条目会同步到 doc_acl
-- =====================================================

CREATE TABLE kb_knowledge.space_acl (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    space_id        VARCHAR(64) NOT NULL,
    accessor_type   VARCHAR(16) NOT NULL CHECK (accessor_type IN ('USER', 'ROLE', 'DEPT')),
    accessor_id     VARCHAR(128) NOT NULL,
    permission      VARCHAR(16) NOT NULL DEFAULT 'READ' CHECK (permission IN ('READ', 'WRITE', 'ADMIN')),
    acl_version     BIGINT      NOT NULL DEFAULT 1,
    created_at      TIMESTAMP   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT now(),
    CONSTRAINT uk_space_acl UNIQUE (tenant_id, space_id, accessor_type, accessor_id)
);

-- 索引
CREATE INDEX idx_space_acl_tenant_space ON kb_knowledge.space_acl (tenant_id, space_id);
CREATE INDEX idx_space_acl_accessor ON kb_knowledge.space_acl (accessor_type, accessor_id);
CREATE INDEX idx_space_acl_space ON kb_knowledge.space_acl (space_id);

-- 注释
COMMENT ON TABLE kb_knowledge.space_acl IS '知识空间权限绑定表（角色/用户/部门对知识空间的访问权限）';
COMMENT ON COLUMN kb_knowledge.space_acl.accessor_type IS '访问者类型：USER=用户, ROLE=角色, DEPT=部门';
COMMENT ON COLUMN kb_knowledge.space_acl.permission IS '权限级别：READ=只读(可检索), WRITE=编辑(可上传), ADMIN=管理(可删除空间)';

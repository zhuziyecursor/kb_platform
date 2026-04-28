-- =============================================================================
-- 用户服务 - user-service 数据表
-- =============================================================================

-- 租户
CREATE TABLE kb_user.tenant (
    tenant_id   VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    status      VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMP    NOT NULL DEFAULT now()
);

-- 组织部门 (使用 ltree 扩展)
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE kb_user.org_dept (
    dept_id     VARCHAR(64)  PRIMARY KEY,
    tenant_id   VARCHAR(64)  NOT NULL REFERENCES kb_user.tenant(tenant_id),
    name        VARCHAR(128) NOT NULL,
    dept_path   ltree        NOT NULL,
    parent_id   VARCHAR(64),
    status      VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE'
);

CREATE UNIQUE INDEX uk_org_dept_path ON kb_user.org_dept (tenant_id, dept_path);
CREATE INDEX idx_org_dept_parent ON kb_user.org_dept (parent_id) WHERE parent_id IS NOT NULL;

COMMENT ON COLUMN kb_user.org_dept.dept_path IS '部门树路径, 如 集团.审计部.一处';

-- 用户
CREATE TABLE kb_user."user" (
    uid         VARCHAR(64)  PRIMARY KEY,
    tenant_id   VARCHAR(64)  NOT NULL REFERENCES kb_user.tenant(tenant_id),
    username    VARCHAR(128) NOT NULL,
    display_name VARCHAR(128),
    email       VARCHAR(256),
    phone       VARCHAR(32),
    sec_level   INT          NOT NULL DEFAULT 1,
    region      VARCHAR(32),
    status      VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uk_user_tenant_username ON kb_user."user" (tenant_id, username);
CREATE INDEX idx_user_tenant_status ON kb_user."user" (tenant_id, status);

-- 用户-部门关联
CREATE TABLE kb_user.user_dept (
    uid         VARCHAR(64)  NOT NULL REFERENCES kb_user."user"(uid),
    dept_id     VARCHAR(64)  NOT NULL REFERENCES kb_user.org_dept(dept_id),
    is_primary  BOOLEAN      NOT NULL DEFAULT false,
    PRIMARY KEY (uid, dept_id)
);

CREATE INDEX idx_user_dept_dept ON kb_user.user_dept (dept_id);

-- 角色
CREATE TABLE kb_user.role (
    role_code   VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    scope       VARCHAR(16)  NOT NULL DEFAULT 'GLOBAL'
);

COMMENT ON TABLE kb_user.role IS '预置: SUPER_ADMIN, DEPT_ADMIN, USER';

-- 用户-角色关联
CREATE TABLE kb_user.user_role (
    uid         VARCHAR(64)  NOT NULL REFERENCES kb_user."user"(uid),
    role_code   VARCHAR(64)  NOT NULL REFERENCES kb_user.role(role_code),
    tenant_id   VARCHAR(64)  NOT NULL,
    PRIMARY KEY (uid, role_code, tenant_id)
);

-- 权限定义
CREATE TABLE kb_user.permission (
    perm_code   VARCHAR(128) PRIMARY KEY,
    name        VARCHAR(128) NOT NULL
);

-- 角色-权限关联
CREATE TABLE kb_user.role_permission (
    role_code   VARCHAR(64)  NOT NULL REFERENCES kb_user.role(role_code),
    perm_code   VARCHAR(128) NOT NULL REFERENCES kb_user.permission(perm_code),
    scope       VARCHAR(64)  NOT NULL DEFAULT 'GLOBAL',
    PRIMARY KEY (role_code, perm_code, scope)
);

-- 权限组 (解决 Milvus expr 过长问题)
CREATE TABLE kb_user.perm_group (
    group_id    BIGSERIAL   PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    name        VARCHAR(128) NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE INDEX idx_perm_group_tenant ON kb_user.perm_group (tenant_id);

-- 权限组成员
CREATE TABLE kb_user.perm_group_member (
    group_id        BIGINT      NOT NULL REFERENCES kb_user.perm_group(group_id) ON DELETE CASCADE,
    accessor_type   VARCHAR(16) NOT NULL,
    accessor_id     VARCHAR(128) NOT NULL,
    PRIMARY KEY (group_id, accessor_type, accessor_id)
);

COMMENT ON TABLE kb_user.perm_group IS '权限组: 将用户可访问的 dept/role 集合映射为 group_id, 用于 Milvus metadata 预过滤';

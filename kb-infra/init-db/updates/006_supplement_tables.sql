-- =============================================================================
-- 企业 AI 知识库 - 数据库补充脚本 (MVP 必需)
-- =============================================================================
-- 说明：基于技术方案分析，需要补充以下表以满足MVP需求
-- 执行顺序：在原有5个脚本之后执行
-- =============================================================================

-- =============================================================================
-- 补充1：文档操作审计表 (kb_audit)
-- 用途：记录文档的上传、下架、删除、ACL变更等关键操作
-- 优先级：🔴 高
-- =============================================================================

CREATE TABLE kb_audit.kb_doc_audit (
    id              BIGSERIAL   PRIMARY KEY,
    ts              TIMESTAMP   NOT NULL DEFAULT now(),
    trace_id        VARCHAR(128),
    tenant_id       VARCHAR(64) NOT NULL,
    uid             VARCHAR(64) NOT NULL,
    action          VARCHAR(32) NOT NULL,  -- UPLOAD/COMMIT/INGEST/OFFBOARD/DELETE/ACL_UPDATE/REVOKE
    doc_id          VARCHAR(128),
    version         INT,
    result          VARCHAR(16) NOT NULL,  -- SUCCESS/FAILED/PARTIAL
    error_code      VARCHAR(64),
    error_msg       TEXT,
    detail          JSONB,                   -- 存储额外信息（ACL变更前后diff、文件hash等）
    ip_address      VARCHAR(64),
    user_agent      VARCHAR(512),
    created_at      TIMESTAMP   NOT NULL DEFAULT now()
);

-- 审计表索引
CREATE INDEX idx_doc_audit_tenant_ts  ON kb_audit.kb_doc_audit (tenant_id, ts DESC);
CREATE INDEX idx_doc_audit_uid_ts     ON kb_audit.kb_doc_audit (uid, ts DESC);
CREATE INDEX idx_doc_audit_doc        ON kb_audit.kb_doc_audit (doc_id, ts DESC);
CREATE INDEX idx_doc_audit_action     ON kb_audit.kb_doc_audit (action, ts DESC);
CREATE INDEX idx_doc_audit_tenant_action ON kb_audit.kb_doc_audit (tenant_id, action, ts DESC);

COMMENT ON TABLE kb_audit.kb_doc_audit IS '文档操作审计: 上传/入库/下架/删除/ACL变更';
COMMENT ON COLUMN kb_audit.kb_doc_audit.action IS 'UPLOAD:上传文件 | COMMIT:提交元数据 | INGEST:触发入库 | OFFBOARD:下架 | DELETE:删除 | ACL_UPDATE:权限变更 | REVOKE:撤权';

-- =============================================================================
-- 补充2：嵌入任务队列表 (kb_knowledge)
-- 用途：Milvus upsert 幂等性保障，处理 Kafka 消息丢失场景
-- 优先级：🟡 中
-- =============================================================================

CREATE TABLE kb_knowledge.embed_task (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    doc_id          VARCHAR(128) NOT NULL,
    version         INT         NOT NULL,
    chunk_seq       INT         NOT NULL,
    text_hash       VARCHAR(64) NOT NULL,  -- 用于幂等性校验
    title           VARCHAR(256),
    section_path    VARCHAR(256),
    page            INT,
    dept_id         VARCHAR(64),
    sec_level       INT         NOT NULL DEFAULT 1,
    region_code     VARCHAR(32) NOT NULL DEFAULT 'CN-NATIONAL',
    biz_domain      VARCHAR(64) NOT NULL DEFAULT 'COMPLIANCE',
    perm_group_id   BIGINT,
    acl_version     BIGINT      NOT NULL DEFAULT 1,
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING/PROCESSING/DONE/FAILED
    milvus_pk       BIGINT,      -- Milvus 返回的主键，用于更新
    milvus_version  BIGINT,      -- Milvus 中该记录的版本
    retry_count     INT         NOT NULL DEFAULT 0,
    max_retries     INT         NOT NULL DEFAULT 3,
    error_code      VARCHAR(64),
    error_msg       TEXT,
    created_at      TIMESTAMP   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT now(),
    processed_at    TIMESTAMP,
    UNIQUE (tenant_id, doc_id, version, chunk_seq, text_hash)
);

-- 嵌入任务表索引
CREATE INDEX idx_embed_task_status     ON kb_knowledge.embed_task (status, created_at);
CREATE INDEX idx_embed_task_tenant    ON kb_knowledge.embed_task (tenant_id, status);
CREATE INDEX idx_embed_task_doc       ON kb_knowledge.embed_task (tenant_id, doc_id, version);
CREATE INDEX idx_embed_task_retry     ON kb_knowledge.embed_task (status, retry_count) WHERE retry_count < max_retries;

COMMENT ON TABLE kb_knowledge.embed_task IS '嵌入任务队列: Milvus upsert 幂等性保障，处理 Kafka 消息丢失/重复场景';
COMMENT ON COLUMN kb_knowledge.embed_task.text_hash IS '段落文本的 SHA256 hash，用于幂等性校验';
COMMENT ON COLUMN kb_knowledge.embed_task.milvus_pk IS 'Milvus 返回的主键，PROCESSING 时写入，DONE 时确认';

-- =============================================================================
-- 补充3：用户上下文缓存表 (kb_user)
-- 用途：多服务间用户上下文一致性保障，Redis 优先，此表作为持久化备份
-- 优先级：🟡 中
-- =============================================================================

CREATE TABLE kb_user.user_context_cache (
    uid             VARCHAR(64)  PRIMARY KEY,
    tenant_id       VARCHAR(64)  NOT NULL,
    username        VARCHAR(128),
    display_name    VARCHAR(128),
    email           VARCHAR(256),
    role_codes      TEXT[],       -- PostgreSQL 数组类型
    dept_ids        TEXT[],
    dept_paths      TEXT[],       -- 保留 dept_path 便于查询
    sec_level       INT          NOT NULL DEFAULT 1,
    region_scopes   TEXT[],
    biz_domain_scopes TEXT[],
    project_tags    TEXT[],
    perm_group_ids  BIGINT[],
    ctx_json        JSONB,        -- 完整的用户上下文 JSON
    ctx_ver         BIGINT       NOT NULL DEFAULT 1,  -- 版本号，用于缓存一致性
    ctx_hash        CHAR(64),     -- 上下文的 hash，用于快速比对
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    cached_at       TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT now(),
    expires_at      TIMESTAMP    -- 缓存过期时间
);

-- 用户上下文缓存索引
CREATE INDEX idx_user_context_tenant ON kb_user.user_context_cache (tenant_id);
CREATE INDEX idx_user_context_ver    ON kb_user.user_context_cache (tenant_id, ctx_ver);
CREATE INDEX idx_user_context_active ON kb_user.user_context_cache (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_user_context_expire ON kb_user.user_context_cache (expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE kb_user.user_context_cache IS '用户上下文缓存表: 多服务间用户上下文一致性保障，Redis 优先此表作为持久化备份';

-- =============================================================================
-- 补充4：权限组与文档的关联表 (kb_knowledge)
-- 用途：解决 Milvus expr 过长问题，将"文档可被哪些权限组访问"映射存储
-- 说明：perm_group_member 已包含 accessor，这里补充文档与权限组的直接关联
-- 优先级：🟢 低（可由应用层计算）
-- =============================================================================

CREATE TABLE kb_knowledge.doc_perm_group (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    doc_id          VARCHAR(128) NOT NULL,
    version         INT         NOT NULL,
    perm_group_id   BIGINT      NOT NULL REFERENCES kb_user.perm_group(group_id),
    grant_type      VARCHAR(16) NOT NULL DEFAULT 'DIRECT',  -- DIRECT:直接授权 | INHERIT:继承（从部门/角色继承）
    created_at      TIMESTAMP   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, doc_id, version, perm_group_id)
);

CREATE INDEX idx_doc_perm_group_doc   ON kb_knowledge.doc_perm_group (tenant_id, doc_id, version);
CREATE INDEX idx_doc_perm_group_group ON kb_knowledge.doc_perm_group (perm_group_id);

COMMENT ON TABLE kb_knowledge.doc_perm_group IS '文档与权限组关联: 用于 Milvus perm_group_id 预过滤，解决 expr 过长问题';

-- =============================================================================
-- 补充5：ACL变更历史表 (kb_audit)
-- 用途：ACL变更可追溯，支持审计与回滚
-- 优先级：🟢 低
-- =============================================================================

CREATE TABLE kb_audit.acl_change_history (
    id              BIGSERIAL   PRIMARY KEY,
    ts              TIMESTAMP   NOT NULL DEFAULT now(),
    trace_id        VARCHAR(128),
    tenant_id       VARCHAR(64) NOT NULL,
    uid             VARCHAR(64) NOT NULL,  -- 操作人
    doc_id          VARCHAR(128) NOT NULL,
    version         INT         NOT NULL,
    change_type     VARCHAR(16) NOT NULL,  -- GRANT/REVOKE/MODIFY
    accessor_type   VARCHAR(16) NOT NULL,  -- USER/ROLE/DEPT
    accessor_id     VARCHAR(128) NOT NULL,
    old_permission  VARCHAR(16),           -- 变更前的权限
    new_permission  VARCHAR(16),           -- 变更后的权限
    reason          VARCHAR(256),
    result          VARCHAR(16) NOT NULL   -- SUCCESS/FAILED
);

CREATE INDEX idx_acl_history_doc      ON kb_audit.acl_change_history (tenant_id, doc_id, ts DESC);
CREATE INDEX idx_acl_history_uid     ON kb_audit.acl_change_history (uid, ts DESC);

COMMENT ON TABLE kb_audit.acl_change_history IS 'ACL变更历史: GRANT/REVOKE/MODIFY 操作记录，支持审计与回滚';

-- =============================================================================
-- 现有表补充字段 (ALTER TABLE)
-- =============================================================================

-- 5.1 kb_search_audit 补充字段
ALTER TABLE kb_audit.kb_search_audit 
    ADD COLUMN IF NOT EXISTS biz_domain VARCHAR(64) NOT NULL DEFAULT 'COMPLIANCE',
    ADD COLUMN IF NOT EXISTS lang VARCHAR(16) NOT NULL DEFAULT 'zh',
    ADD COLUMN IF NOT EXISTS session_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS citations_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS denied_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rerank_skipped BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS query_rewrite_used BOOLEAN DEFAULT false;

COMMENT ON COLUMN kb_audit.kb_search_audit.biz_domain IS '业务域: COMPLIANCE/AUDIT/HR/BID_TENDER 等';
COMMENT ON COLUMN kb_audit.kb_search_audit.session_id IS '会话ID，用于聚合多轮对话';
COMMENT ON COLUMN kb_audit.kb_search_audit.citations_count IS '返回的引用数量';
COMMENT ON COLUMN kb_audit.kb_search_audit.denied_count IS '被权限拒绝的文档数量';

-- 5.2 kb_user.org_dept 补充索引
CREATE INDEX IF NOT EXISTS idx_org_dept_tenant_status ON kb_user.org_dept (tenant_id, status);

-- 5.3 kb_auth.token_audit 补充字段（可选用于分区场景）
ALTER TABLE kb_auth.token_audit 
    ADD COLUMN IF NOT EXISTS request_id VARCHAR(128),  -- 请求追踪ID
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
    ADD COLUMN IF NOT EXISTS user_agent VARCHAR(512);

-- =============================================================================
-- 预置数据 (种子数据)
-- =============================================================================

-- 预置角色
INSERT INTO kb_user.role (role_code, name, scope) VALUES
    ('SUPER_ADMIN', '超级管理员', 'GLOBAL'),
    ('DEPT_ADMIN', '部门管理员', 'TENANT'),
    ('USER', '普通用户', 'TENANT'),
    ('KB_OPERATOR', '知识库运营', 'TENANT'),
    ('KB_AUDITOR', '知识库审计', 'TENANT')
ON CONFLICT (role_code) DO NOTHING;

-- 预置权限
INSERT INTO kb_user.permission (perm_code, name) VALUES
    ('kb:upload', '上传文档'),
    ('kb:search', '搜索知识'),
    ('kb:admin', '知识库管理'),
    ('kb:acl', '权限管理'),
    ('kb:audit', '审计查看'),
    ('ocr:invoke', 'OCR识别'),
    ('ocr:admin', 'OCR管理')
ON CONFLICT (perm_code) DO NOTHING;

-- 预置角色-权限关联
INSERT INTO kb_user.role_permission (role_code, perm_code, scope) VALUES
    ('SUPER_ADMIN', 'kb:upload', 'GLOBAL'),
    ('SUPER_ADMIN', 'kb:search', 'GLOBAL'),
    ('SUPER_ADMIN', 'kb:admin', 'GLOBAL'),
    ('SUPER_ADMIN', 'kb:acl', 'GLOBAL'),
    ('SUPER_ADMIN', 'kb:audit', 'GLOBAL'),
    ('SUPER_ADMIN', 'ocr:invoke', 'GLOBAL'),
    ('SUPER_ADMIN', 'ocr:admin', 'GLOBAL'),
    ('DEPT_ADMIN', 'kb:upload', 'TENANT'),
    ('DEPT_ADMIN', 'kb:search', 'TENANT'),
    ('DEPT_ADMIN', 'kb:admin', 'TENANT'),
    ('DEPT_ADMIN', 'kb:acl', 'TENANT'),
    ('KB_OPERATOR', 'kb:upload', 'TENANT'),
    ('KB_OPERATOR', 'kb:search', 'TENANT'),
    ('KB_OPERATOR', 'kb:admin', 'TENANT'),
    ('KB_AUDITOR', 'kb:audit', 'TENANT'),
    ('USER', 'kb:search', 'TENANT')
ON CONFLICT (role_code, perm_code, scope) DO NOTHING;

-- =============================================================================
-- 分区表建议（PostgreSQL 15+，用于大表性能优化）
-- =============================================================================
-- 注意：以下为注释掉的分区表示例，实际使用时取消注释并修改日期范围
-- 如果需要启用分区，执行以下脚本（按月度分区，保留180天）

/*
-- 1. 创建 token_audit 分区表（替换原表）
BEGIN;
CREATE TABLE kb_auth.token_audit_partitioned (
    id          BIGSERIAL,
    ts          TIMESTAMP   NOT NULL DEFAULT now(),
    trace_id    VARCHAR(128),
    client_id   VARCHAR(128),
    uid         VARCHAR(64),
    tenant_id   VARCHAR(64),
    grant_type  VARCHAR(128) NOT NULL,
    audience    VARCHAR(64),
    scopes      TEXT,
    result      VARCHAR(16)  NOT NULL,
    error_code  VARCHAR(64),
    request_id  VARCHAR(128),
    ip_address  VARCHAR(64),
    user_agent  VARCHAR(512),
    PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

-- 将原表数据迁移到分区表
INSERT INTO kb_auth.token_audit_partitioned 
SELECT * FROM kb_auth.token_audit;

-- 删除原表并重命名
DROP TABLE kb_auth.token_audit;
ALTER TABLE kb_auth.token_audit_partitioned RENAME TO token_audit;

-- 创建初始分区（未来由定时任务自动创建）
CREATE TABLE kb_auth.token_audit_2026_05 PARTITION OF kb_auth.token_audit
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE kb_auth.token_audit_2026_06 PARTITION OF kb_auth.token_audit
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- ... 依此类推

COMMIT;

-- 2. 创建 kb_search_audit 分区表（同样方式处理）
BEGIN;
CREATE TABLE kb_audit.kb_search_audit_partitioned (
    id              BIGSERIAL,
    ts              TIMESTAMP   NOT NULL DEFAULT now(),
    trace_id        VARCHAR(128),
    tenant_id       VARCHAR(64) NOT NULL,
    uid             VARCHAR(64) NOT NULL,
    app_id          VARCHAR(128),
    workflow_id     VARCHAR(128),
    query_text      TEXT,
    topk            INT,
    denied_ids      TEXT,
    result          VARCHAR(16) NOT NULL,
    biz_domain      VARCHAR(64) NOT NULL DEFAULT 'COMPLIANCE',
    lang            VARCHAR(16) NOT NULL DEFAULT 'zh',
    session_id      VARCHAR(128),
    citations_count INT DEFAULT 0,
    denied_count    INT DEFAULT 0,
    rerank_skipped  BOOLEAN DEFAULT false,
    query_rewrite_used BOOLEAN DEFAULT false,
    PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

INSERT INTO kb_audit.kb_search_audit_partitioned 
SELECT * FROM kb_audit.kb_search_audit;

DROP TABLE kb_audit.kb_search_audit;
ALTER TABLE kb_audit.kb_search_audit_partitioned RENAME TO kb_search_audit;

-- 创建初始分区
CREATE TABLE kb_audit.kb_search_audit_2026_05 PARTITION OF kb_audit.kb_search_audit
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
-- ...
COMMIT;

-- 3. 创建自动创建月度分区的函数（建议加入 pg_cron）
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
    partition_date DATE;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    -- 预创建下个月的分区
    partition_date := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '2 months');
    partition_name := 'token_audit_' || TO_CHAR(partition_date, 'YYYY_MM');
    start_date := TO_CHAR(partition_date, 'YYYY-MM-DD');
    end_date := TO_CHAR(partition_date + INTERVAL '1 month', 'YYYY-MM-DD');
    
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS kb_auth.%I PARTITION OF kb_auth.token_audit FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
END;
$$ LANGUAGE plpgsql;
*/

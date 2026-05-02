-- =============================================================================
-- 知识元数据 - 知识库核心数据表
-- =============================================================================

-- 文档元数据
CREATE TABLE kb_knowledge.knowledge_doc (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    doc_id          VARCHAR(128) NOT NULL,
    version         INT         NOT NULL DEFAULT 1,
    title           VARCHAR(256),
    source_type     VARCHAR(32) NOT NULL,
    doc_type        VARCHAR(32) NOT NULL,
    src_path        VARCHAR(512) NOT NULL,
    sha256          VARCHAR(64) NOT NULL,
    owner_uid       VARCHAR(64),
    dept_id         VARCHAR(64),
    sec_level       INT         NOT NULL DEFAULT 1,
    region_code     VARCHAR(32) NOT NULL DEFAULT 'CN-NATIONAL',
    biz_domain      VARCHAR(64) NOT NULL DEFAULT 'COMPLIANCE',
    effective_from  DATE,
    effective_to    DATE,
    label_tags      TEXT,
    status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    create_time     TIMESTAMP   NOT NULL DEFAULT now(),
    expire_time     TIMESTAMP
);

CREATE UNIQUE INDEX uk_doc_tenant_id_version ON kb_knowledge.knowledge_doc (tenant_id, doc_id, version);
CREATE INDEX idx_doc_tenant_status     ON kb_knowledge.knowledge_doc (tenant_id, status);
CREATE INDEX idx_doc_tenant_dept       ON kb_knowledge.knowledge_doc (tenant_id, dept_id);
CREATE INDEX idx_doc_tenant_region_domain ON kb_knowledge.knowledge_doc (tenant_id, region_code, biz_domain);
CREATE INDEX idx_doc_tenant_seclevel   ON kb_knowledge.knowledge_doc (tenant_id, sec_level);

COMMENT ON TABLE kb_knowledge.knowledge_doc IS '文档元数据主表';
COMMENT ON COLUMN kb_knowledge.knowledge_doc.status IS 'DRAFT/PENDING/READY/FAILED/OFFBOARDED/DELETED';
COMMENT ON COLUMN kb_knowledge.knowledge_doc.source_type IS 'UPLOAD/CDC/CRAWL/API';
COMMENT ON COLUMN kb_knowledge.knowledge_doc.doc_type IS 'REGULATION/POLICY/AUDIT/WEBPAGE/API/IMAGE';

-- 清洗层数据
CREATE TABLE kb_knowledge.knowledge_clean (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    doc_id          VARCHAR(128) NOT NULL,
    src_path        VARCHAR(512) NOT NULL,
    sha256          VARCHAR(64) NOT NULL,
    cleaned_text    TEXT        NOT NULL,
    language        VARCHAR(16) NOT NULL DEFAULT 'zh',
    parse_method    VARCHAR(32) NOT NULL DEFAULT 'TIKA',
    quality_score   NUMERIC(5,2) NOT NULL DEFAULT 0,
    meta_json       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_time    TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uk_clean_tenant_doc_hash ON kb_knowledge.knowledge_clean (tenant_id, doc_id, sha256);

COMMENT ON TABLE kb_knowledge.knowledge_clean IS '清洗层: 统一文本 + 页码锚点 + 基础 meta';
COMMENT ON COLUMN kb_knowledge.knowledge_clean.parse_method IS 'TIKA/TIKA_OCR/CDC/CRAWL';
COMMENT ON COLUMN kb_knowledge.knowledge_clean.quality_score IS '解析质量评分 (0-100)';

-- 结构化层数据
CREATE TABLE kb_knowledge.knowledge_structured (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    doc_id          VARCHAR(128) NOT NULL,
    version         INT         NOT NULL,
    json_body       JSONB       NOT NULL,
    extractor_ver   VARCHAR(32) NOT NULL DEFAULT 'v1',
    created_at      TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uk_structured_tenant_doc_version ON kb_knowledge.knowledge_structured (tenant_id, doc_id, version);

COMMENT ON TABLE kb_knowledge.knowledge_structured IS '结构化层: 标题层级/表格/实体/OCR bbox';
COMMENT ON COLUMN kb_knowledge.knowledge_structured.json_body IS 'JSON 字段: sections[].{section_path, page, paragraphs[].{text, bbox, conf}, tables, entities}';

-- 文档版本状态机
CREATE TABLE kb_knowledge.knowledge_version (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    doc_id          VARCHAR(128) NOT NULL,
    version         INT         NOT NULL,
    status          VARCHAR(16) NOT NULL,
    created_by      VARCHAR(64) NOT NULL,
    created_at      TIMESTAMP   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, doc_id, version)
);

CREATE INDEX idx_version_tenant_status ON kb_knowledge.knowledge_version (tenant_id, status);

COMMENT ON TABLE kb_knowledge.knowledge_version IS '文档版本状态机: PENDING/READY/FAILED/OFFBOARDED';

-- 文档 ACL (文档级权限)
CREATE TABLE kb_knowledge.doc_acl (
    id              BIGSERIAL   PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    doc_id          VARCHAR(128) NOT NULL,
    accessor_type   VARCHAR(16) NOT NULL,
    accessor_id     VARCHAR(128) NOT NULL,
    permission      VARCHAR(16) NOT NULL DEFAULT 'READ',
    acl_version     BIGINT      NOT NULL DEFAULT 1,
    UNIQUE (tenant_id, doc_id, accessor_type, accessor_id)
);

CREATE INDEX idx_acl_tenant_doc ON kb_knowledge.doc_acl (tenant_id, doc_id);
CREATE INDEX idx_acl_accessor   ON kb_knowledge.doc_acl (accessor_type, accessor_id);

COMMENT ON TABLE kb_knowledge.doc_acl IS '文档级 ACL: accessor_type = USER/ROLE/DEPT';
COMMENT ON COLUMN kb_knowledge.doc_acl.permission IS 'READ/WRITE/ADMIN';

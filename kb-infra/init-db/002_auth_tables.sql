-- =============================================================================
-- 认证适配器 - auth-adapter-service 数据表
-- =============================================================================

-- OAuth2 客户端注册
CREATE TABLE kb_auth.oauth_client (
    client_id       VARCHAR(128) PRIMARY KEY,
    client_secret_hash VARCHAR(255) NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    allowed_audiences TEXT NOT NULL DEFAULT '',
    allowed_scopes  TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT now()
);

COMMENT ON TABLE kb_auth.oauth_client IS 'OAuth2 客户端注册表 (confidential client)';
COMMENT ON COLUMN kb_auth.oauth_client.client_secret_hash IS 'bcrypt/argon2 hash, 不存明文';
COMMENT ON COLUMN kb_auth.oauth_client.allowed_audiences IS '逗号分隔: mcp-kb,mcp-ocr';

-- JWT 密钥存储 (kid 轮换)
CREATE TABLE kb_auth.key_store (
    kid             VARCHAR(64)  PRIMARY KEY,
    alg             VARCHAR(16)  NOT NULL DEFAULT 'RS256',
    private_key_ref VARCHAR(512) NOT NULL,
    public_jwk      JSONB        NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMP    NOT NULL DEFAULT now(),
    rotate_at       TIMESTAMP    NOT NULL
);

COMMENT ON TABLE kb_auth.key_store IS 'JWT 签名密钥管理 (生产环境 private_key_ref 指向 KMS/Vault)';

-- Token 审计日志
CREATE TABLE kb_auth.token_audit (
    id          BIGSERIAL   PRIMARY KEY,
    ts          TIMESTAMP   NOT NULL DEFAULT now(),
    trace_id    VARCHAR(128),
    client_id   VARCHAR(128),
    uid         VARCHAR(64),
    tenant_id   VARCHAR(64),
    grant_type  VARCHAR(128) NOT NULL,
    audience    VARCHAR(64),
    scopes      TEXT,
    result      VARCHAR(16)  NOT NULL,
    error_code  VARCHAR(64)
);

CREATE INDEX idx_token_audit_ts      ON kb_auth.token_audit (ts);
CREATE INDEX idx_token_audit_tenant  ON kb_auth.token_audit (tenant_id, ts);
CREATE INDEX idx_token_audit_uid     ON kb_auth.token_audit (uid, ts);

COMMENT ON TABLE kb_auth.token_audit IS 'Token 签发/拒绝审计 (含 OBO token exchange)';

-- JTI 黑名单 (紧急吊销)
CREATE TABLE kb_auth.jti_blacklist (
    jti         VARCHAR(128) PRIMARY KEY,
    expire_at   TIMESTAMP   NOT NULL,
    reason      VARCHAR(256),
    created_at  TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE INDEX idx_jti_blacklist_expire ON kb_auth.jti_blacklist (expire_at);

COMMENT ON TABLE kb_auth.jti_blacklist IS 'JWT JTI 黑名单 (用于紧急吊销 access/obo token)';

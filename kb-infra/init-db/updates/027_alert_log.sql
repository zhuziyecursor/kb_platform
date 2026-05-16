-- =============================================================================
-- RAG 监控告警日志
-- rag-service 拥有，写入 kb_audit schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS kb_audit.alert_log (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    alert_type      VARCHAR(64) NOT NULL,
    severity        VARCHAR(16) NOT NULL CHECK (severity IN ('WARN', 'CRITICAL')),
    message         TEXT NOT NULL,
    metric_value    DOUBLE PRECISION,
    threshold_value DOUBLE PRECISION,
    resolved        BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_tenant_created
    ON kb_audit.alert_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_log_tenant_unresolved
    ON kb_audit.alert_log (tenant_id, resolved, created_at DESC)
    WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_alert_log_dedupe
    ON kb_audit.alert_log (tenant_id, alert_type, created_at DESC);

COMMENT ON TABLE kb_audit.alert_log IS 'RAG 监控告警日志';
COMMENT ON COLUMN kb_audit.alert_log.alert_type IS '告警类型，例如 error_rate/refusal_rate/dead_service';
COMMENT ON COLUMN kb_audit.alert_log.severity IS 'WARN/CRITICAL';
COMMENT ON COLUMN kb_audit.alert_log.resolved IS '是否已处理';

GRANT SELECT, INSERT, UPDATE ON kb_audit.alert_log TO kb_rag;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_audit TO kb_rag;

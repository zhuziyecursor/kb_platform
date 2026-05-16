-- ============================================================================
-- Migration: V007 - Add Alert Log Table
-- Purpose: Store triggered alert events for the intelligent alerting system
-- Author: System Optimization
-- Date: 2026-05-14
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_audit.alert_log (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(64)  NOT NULL,
    alert_type      VARCHAR(64)  NOT NULL,
    severity        VARCHAR(16)  NOT NULL DEFAULT 'WARN',
    message         TEXT         NOT NULL,
    metric_value    DOUBLE PRECISION,
    threshold_value DOUBLE PRECISION,
    resolved        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_tenant_time
    ON kb_audit.alert_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_log_unresolved
    ON kb_audit.alert_log(tenant_id, alert_type, created_at DESC)
    WHERE resolved = FALSE;

DO $$
BEGIN
    RAISE NOTICE 'Alert log table and indexes created successfully';
END $$;

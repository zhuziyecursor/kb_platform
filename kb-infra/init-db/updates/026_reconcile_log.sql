-- 026_reconcile_log.sql
-- Sprint 2 Task 2.3: reconcile_log table for Milvus / PG data consistency checks.
-- Records results of scheduled ReconcileJob runs.

BEGIN;

CREATE TABLE IF NOT EXISTS kb_audit.reconcile_log (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    run_at          TIMESTAMP NOT NULL DEFAULT now(),
    pg_count        BIGINT,
    milvus_count    BIGINT,
    missing_in_milvus BIGINT,
    missing_in_pg   BIGINT,
    repaired_to_milvus BIGINT DEFAULT 0,
    repaired_to_pg  BIGINT DEFAULT 0,
    duration_ms     BIGINT,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_reconcile_log_tenant
    ON kb_audit.reconcile_log (tenant_id, run_at DESC);

GRANT INSERT, SELECT ON kb_audit.reconcile_log TO kb_vector;

COMMIT;

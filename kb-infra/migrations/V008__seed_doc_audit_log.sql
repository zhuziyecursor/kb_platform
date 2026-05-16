-- ============================================================================
-- Migration: V008 - Seed Document Operations Audit Log
-- Purpose: Generate realistic operations log data based on existing documents
-- ============================================================================

-- Clear existing data
TRUNCATE kb_audit.kb_doc_audit;

-- Insert realistic audit trail for each document based on its lifecycle
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    -- UPLOAD event (at doc create_time)
    d.create_time AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    d.owner_uid,
    'UPLOAD',
    d.doc_id,
    d.version,
    'SUCCESS',
    jsonb_build_object(
        'filename', split_part(d.src_path, '/', -1),
        'fileSize', d.file_size,
        'docType', d.doc_type,
        'spaceId', d.knowledge_space_id
    ),
    CASE WHEN d.owner_uid = 'current-user' THEN '10.0.1.42' ELSE '10.0.2.18' END,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    d.create_time
FROM kb_knowledge.knowledge_doc d
WHERE d.status IN ('READY', 'DRAFT', 'FAILED');

-- COMMIT event (at create_time + random offset)
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    d.create_time + (random() * interval '2 minutes') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    d.owner_uid,
    'COMMIT',
    d.doc_id,
    d.version,
    'SUCCESS',
    jsonb_build_object('sha256', d.sha256),
    CASE WHEN d.owner_uid = 'current-user' THEN '10.0.1.42' ELSE '10.0.2.18' END,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    d.create_time + (random() * interval '2 minutes')
FROM kb_knowledge.knowledge_doc d;

-- INGEST_START event
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    d.create_time + interval '1 minute' + (random() * interval '3 minutes') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    'system',
    'INGEST_START',
    d.doc_id,
    d.version,
    'SUCCESS',
    jsonb_build_object('pipeline', 'default'),
    '10.0.0.1',
    'kb-doc-processor/1.0',
    d.create_time + interval '1 minute' + (random() * interval '3 minutes')
FROM kb_knowledge.knowledge_doc d;

-- INGEST_COMPLETE for READY docs (processing succeeded)
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    d.create_time + interval '3 minutes' + (random() * interval '10 minutes') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    'system',
    'INGEST_COMPLETE',
    d.doc_id,
    d.version,
    'SUCCESS',
    jsonb_build_object(
        'chunks', floor(random() * 200 + 10)::int,
        'tokens', floor(random() * 50000 + 1000)::int,
        'durationMs', floor(random() * 5000 + 500)::int
    ),
    '10.0.0.1',
    'kb-doc-processor/1.0',
    d.create_time + interval '3 minutes' + (random() * interval '10 minutes')
FROM kb_knowledge.knowledge_doc d
WHERE d.status = 'READY';

-- INGEST_FAILED for DRAFT/FAILED docs
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    d.create_time + interval '3 minutes' + (random() * interval '10 minutes') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    'system',
    'INGEST_FAILED',
    d.doc_id,
    d.version,
    'FAILURE',
    jsonb_build_object(
        'errorCode', (ARRAY['PARSE_ERROR', 'CHUNK_TIMEOUT', 'EMBED_FAILED', 'MILVUS_WRITE_ERR'])[floor(random() * 4 + 1)],
        'errorMsg', (ARRAY['文档解析失败：PDF 内容无法识别', '切片超时：文档过大', '向量化服务不可用', 'Milvus 写入超时'])[floor(random() * 4 + 1)]
    ),
    '10.0.0.1',
    'kb-doc-processor/1.0',
    d.create_time + interval '3 minutes' + (random() * interval '10 minutes')
FROM kb_knowledge.knowledge_doc d
WHERE d.status IN ('DRAFT', 'FAILED');

-- STATUS_CHANGE events for some docs (10 random ones)
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    d.create_time + interval '2 days' + (random() * interval '1 day') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    'admin',
    'STATUS_CHANGE',
    d.doc_id,
    d.version,
    'SUCCESS',
    jsonb_build_object('from', 'DRAFT', 'to', 'READY'),
    '10.0.1.100',
    'Mozilla/5.0',
    d.create_time + interval '2 days' + (random() * interval '1 day')
FROM kb_knowledge.knowledge_doc d
WHERE d.status = 'READY'
ORDER BY random()
LIMIT 10;

-- DELETE events (3 random DRAFT docs)
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    d.create_time + interval '2 hours' + (random() * interval '1 day') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    d.owner_uid,
    'DELETE',
    d.doc_id,
    d.version,
    'SUCCESS',
    jsonb_build_object('reason', '用户主动删除测试文档'),
    CASE WHEN d.owner_uid = 'current-user' THEN '10.0.1.42' ELSE '10.0.2.18' END,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    d.create_time + interval '2 hours' + (random() * interval '1 day')
FROM kb_knowledge.knowledge_doc d
WHERE d.doc_id IN (
    'DOC51575964E9024C26',  -- test-5000.bin
    'DOC5F61AAD0C1B4422F',  -- test-10000.bin
    'DOC46C77D109C2F418C'   -- test-50000.bin
)
AND NOT EXISTS (SELECT 1 FROM kb_audit.kb_doc_audit a WHERE a.doc_id = d.doc_id AND a.action = 'DELETE');

-- SEARCH events (documents that appeared in RAG search results)
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    NOW() - (random() * interval '5 days') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    (ARRAY['current-user', 'user-001', 'test-user', 'admin'])[floor(random() * 4 + 1)],
    'SEARCH_HIT',
    d.doc_id,
    d.version,
    'SUCCESS',
    jsonb_build_object(
        'query', (ARRAY['审计流程如何规范', '内部控制要点', '合规检查标准', '资产管理规定', '投资操作指引'])[floor(random() * 5 + 1)],
        'score', round((random() * 0.5 + 0.5)::numeric, 3),
        'channel', (ARRAY['DENSE', 'SPARSE', 'STRUCTURED'])[floor(random() * 3 + 1)]
    ),
    '10.0.1.42',
    'kb-portal/1.0',
    NOW() - (random() * interval '5 days')
FROM kb_knowledge.knowledge_doc d
WHERE d.status = 'READY'
  AND random() < 0.3;  -- 30% of READY docs get search hits

-- PERMISSION_CHANGE for a few docs
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    NOW() - interval '1 day' - (random() * interval '2 days') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    'admin',
    'PERMISSION_CHANGE',
    d.doc_id,
    d.version,
    'SUCCESS',
    jsonb_build_object(
        'secLevel', jsonb_build_object('from', 1, 'to', 2),
        'addedGroups', jsonb_build_array('group-audit', 'group-compliance')
    ),
    '10.0.1.100',
    'kb-portal/1.0',
    NOW() - interval '1 day' - (random() * interval '2 days')
FROM kb_knowledge.knowledge_doc d
WHERE d.status = 'READY'
ORDER BY random()
LIMIT 5;

-- Add extra realistic entries: RETRY events for some FAILED docs
INSERT INTO kb_audit.kb_doc_audit (ts, trace_id, tenant_id, uid, action, doc_id, version, result, detail, ip_address, user_agent, created_at)
SELECT
    d.create_time + interval '1 hour' + (random() * interval '3 hours') AS ts,
    'tr-' || gen_random_uuid()::text AS trace_id,
    d.tenant_id,
    d.owner_uid,
    'RETRY',
    d.doc_id,
    d.version,
    (ARRAY['SUCCESS', 'FAILURE'])[floor(random() * 2 + 1)],
    jsonb_build_object('attempt', floor(random() * 3 + 1)::int),
    '10.0.1.42',
    'kb-portal/1.0',
    d.create_time + interval '1 hour' + (random() * interval '3 hours')
FROM kb_knowledge.knowledge_doc d
WHERE d.status IN ('DRAFT', 'FAILED')
  AND random() < 0.4;

DO $$
DECLARE
    total_count int;
BEGIN
    SELECT COUNT(*) INTO total_count FROM kb_audit.kb_doc_audit;
    RAISE NOTICE 'Seeded % document operation audit records', total_count;
END $$;

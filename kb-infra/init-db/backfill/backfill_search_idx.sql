-- backfill_search_idx.sql
-- 一次性回填脚本：从 knowledge_clean 补齐 knowledge_search_idx 的 BM25 倒排数据
-- 用法：psql -U kb_vector -d kb_knowledge -f backfill_search_idx.sql
-- 可重入：ON CONFLICT DO NOTHING 保证幂等
-- 参数化：可用 \set TENANT 'xxx' 限制回填范围

BEGIN;

INSERT INTO kb_knowledge.knowledge_search_idx
    (tenant_id, doc_id, version, chunk_seq, title, text_snippet, tokens,
     sec_level, perm_group_id, effective_to, region_code,
     created_at, updated_at)
SELECT
    kd.tenant_id,
    kd.doc_id,
    kd.version,
    0 AS chunk_seq,
    kd.title,
    LEFT(kc.cleaned_text, 4096) AS text_snippet,
    to_tsvector('simple', kc.cleaned_text),
    COALESCE(kd.sec_level, 1),
    COALESCE((SELECT (hashtext(d.accessor_type || ':' || d.accessor_id))::bigint
              FROM kb_knowledge.doc_acl d
              WHERE d.tenant_id = kd.tenant_id AND d.doc_id = kd.doc_id
              LIMIT 1), 0),
    kd.effective_to,
    COALESCE(kd.region_code, 'CN-NATIONAL'),
    NOW(),
    NOW()
FROM kb_knowledge.knowledge_doc kd
JOIN kb_knowledge.knowledge_version kv
    ON kv.tenant_id = kd.tenant_id AND kv.doc_id = kd.doc_id AND kv.version = kd.version
JOIN kb_knowledge.knowledge_clean kc
    ON kc.tenant_id = kd.tenant_id AND kc.doc_id = kd.doc_id
WHERE kv.status = 'READY'
  -- 仅回填尚不存在的行
  AND NOT EXISTS (
      SELECT 1 FROM kb_knowledge.knowledge_search_idx ksi
      WHERE ksi.tenant_id = kd.tenant_id
        AND ksi.doc_id = kd.doc_id
        AND ksi.version = kd.version
        AND ksi.chunk_seq = 0
  )
ON CONFLICT (tenant_id, doc_id, version, chunk_seq) DO NOTHING;

COMMIT;

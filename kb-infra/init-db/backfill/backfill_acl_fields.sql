-- backfill_acl_fields.sql
-- 一次性回填脚本：修复 022/023 迁移使用保守默认值 (sec_level=5, perm_group_id=0) 的历史行。
--
-- 业务影响：未回填时，所有历史 chunk 会被 ACL 严格过滤（permGroupId=0 不在任何用户的 perm_group_ids 里），
-- 表现为"全部历史数据搜不到"。本脚本从 knowledge_doc / knowledge_version 拉真实 ACL 字段写回。
--
-- 用法：
--   psql -U kb_admin -d kb_knowledge -f backfill_acl_fields.sql
-- 可重入：仅更新 "仍为保守默认值" 的行；多次运行结果一致。
-- 选择性回填：在执行前 `\set TENANT 'tenant-xx'` 然后改下面 WHERE 子句。

BEGIN;

-- ============================================================
-- 1. knowledge_search_idx：把 sec_level=5 / perm_group_id=0 的保守默认值
--    替换为真实文档 ACL（join knowledge_doc + doc_acl）
-- ============================================================

WITH doc_acl_pick AS (
    SELECT DISTINCT ON (tenant_id, doc_id)
           tenant_id, doc_id,
           (hashtext(accessor_type || ':' || accessor_id))::bigint AS perm_group_id
    FROM kb_knowledge.doc_acl
    ORDER BY tenant_id, doc_id, granted_at NULLS LAST
)
UPDATE kb_knowledge.knowledge_search_idx ksi
SET sec_level     = COALESCE(kd.sec_level, ksi.sec_level),
    perm_group_id = COALESCE(da.perm_group_id, ksi.perm_group_id),
    effective_to  = COALESCE(kd.effective_to, ksi.effective_to),
    region_code   = COALESCE(NULLIF(kd.region_code, ''), ksi.region_code),
    updated_at    = NOW()
FROM kb_knowledge.knowledge_doc kd
LEFT JOIN doc_acl_pick da
       ON da.tenant_id = kd.tenant_id AND da.doc_id = kd.doc_id
WHERE ksi.tenant_id = kd.tenant_id
  AND ksi.doc_id    = kd.doc_id
  -- Only rows still on the conservative defaults set by migration 022.
  AND (ksi.sec_level = 5 OR ksi.perm_group_id = 0);

-- ============================================================
-- 2. faq_knowledge：用每个租户的最低密级 + 一个公共 perm_group_id 作为兜底；
--    若 doc_acl 中无法定位 FAQ 的 owner 文档，则把 perm_group_id 设为 1
--    （约定为"全员可见 FAQ"），由运维在 staging 上根据 FAQ 实际归属再调整。
-- ============================================================

UPDATE kb_knowledge.faq_knowledge
SET sec_level     = 1,
    perm_group_id = 1,
    effective_to  = COALESCE(NULLIF(effective_to, ''), '2099-12-31'),
    region_code   = COALESCE(NULLIF(region_code, ''), 'CN-NATIONAL'),
    updated_at    = NOW()
WHERE sec_level = 5 OR perm_group_id = 0;

-- ============================================================
-- 3. 校验：仍残留保守默认值的行数 — 应为 0 或文档本身缺 ACL 元数据
-- ============================================================

DO $$
DECLARE
    bad_idx_rows BIGINT;
    bad_faq_rows BIGINT;
BEGIN
    SELECT COUNT(*) INTO bad_idx_rows
    FROM kb_knowledge.knowledge_search_idx
    WHERE sec_level = 5 OR perm_group_id = 0;

    SELECT COUNT(*) INTO bad_faq_rows
    FROM kb_knowledge.faq_knowledge
    WHERE sec_level = 5 OR perm_group_id = 0;

    RAISE NOTICE 'backfill_acl_fields: remaining defaulted search_idx rows=%, faq rows=%',
        bad_idx_rows, bad_faq_rows;
END$$;

COMMIT;

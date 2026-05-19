-- 025_structured_acl_perm_group.sql
-- 为 v_knowledge_structured_acl 视图添加 perm_group_id，使 ClauseMatch 能正确读取权限组
-- 避免条款精确命中结果因 perm_group_id=0 被 ACL 后过滤误删

BEGIN;

CREATE OR REPLACE VIEW kb_knowledge.v_knowledge_structured_acl AS
SELECT
    ks.id,
    ks.tenant_id,
    ks.doc_id,
    ks.version,
    ks.json_body,
    ks.extractor_ver,
    ks.created_at,
    COALESCE(kd.sec_level, 1)               AS sec_level,
    COALESCE(kd.region_code, 'CN-NATIONAL') AS region_code,
    COALESCE(kd.biz_domain, 'COMPLIANCE')   AS biz_domain,
    kd.effective_to,
    kd.effective_from,
    -- 取该文档第一个 ROLE 类型的 accessor_id 作为 perm_group_id
    (SELECT accessor_id::bigint
     FROM kb_knowledge.doc_acl
     WHERE tenant_id = ks.tenant_id
       AND doc_id = ks.doc_id
       AND accessor_type = 'ROLE'
     ORDER BY id
     LIMIT 1)                               AS perm_group_id
FROM kb_knowledge.knowledge_structured ks
LEFT JOIN kb_knowledge.knowledge_doc kd
    ON kd.tenant_id = ks.tenant_id
    AND kd.doc_id = ks.doc_id
    AND kd.version = ks.version;

GRANT SELECT ON kb_knowledge.v_knowledge_structured_acl TO kb_rag;

COMMIT;

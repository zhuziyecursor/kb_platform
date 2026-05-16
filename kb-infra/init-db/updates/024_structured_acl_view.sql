-- 024_structured_acl_view.sql
-- 为 knowledge_structured 创建带 ACL 字段的只读视图
-- 避免直接改表（kb-doc-processor 是写入方），通过 JOIN knowledge_doc 获取 ACL 字段

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
    COALESCE(kd.sec_level, 1)          AS sec_level,
    COALESCE(kd.region_code, 'CN-NATIONAL') AS region_code,
    COALESCE(kd.biz_domain, 'COMPLIANCE')   AS biz_domain,
    kd.effective_to,
    kd.effective_from
FROM kb_knowledge.knowledge_structured ks
LEFT JOIN kb_knowledge.knowledge_doc kd
    ON kd.tenant_id = ks.tenant_id
    AND kd.doc_id = ks.doc_id
    AND kd.version = ks.version;

GRANT SELECT ON kb_knowledge.v_knowledge_structured_acl TO kb_rag;

COMMIT;

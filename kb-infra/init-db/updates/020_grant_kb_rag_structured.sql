-- 020_grant_kb_rag_structured.sql
-- 授予 kb_rag 对 knowledge_structured 的只读权限，用于条款编号 Fast Path (A.3)

BEGIN;

GRANT SELECT ON kb_knowledge.knowledge_structured TO kb_rag;

COMMIT;

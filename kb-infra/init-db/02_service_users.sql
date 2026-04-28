-- =============================================================================
-- KB Platform 数据库用户权限配置
-- 每个微服务使用独立的数据库用户，实现权限隔离
-- =============================================================================

-- 创建 kb_ingest 用户（文档入库服务）
CREATE USER kb_ingest WITH PASSWORD 'kb_ingest';
GRANT CONNECT ON DATABASE kb_knowledge TO kb_ingest;

-- kb_ingest 用户的表权限
GRANT USAGE ON SCHEMA kb_knowledge TO kb_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kb_knowledge TO kb_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_ingest;

-- 授予 knowledge_space 表权限
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.knowledge_space TO kb_ingest;

-- 授予 knowledge_doc 表权限
GRANT SELECT, INSERT, UPDATE ON kb_knowledge.knowledge_doc TO kb_ingest;

-- 授予 doc_acl 表权限
GRANT SELECT, INSERT, UPDATE ON kb_knowledge.doc_acl TO kb_ingest;

-- 授予 knowledge_version 表权限（只能 INSERT）
GRANT SELECT, INSERT ON kb_knowledge.knowledge_version TO kb_ingest;

-- 创建其他服务用户（占位，待后续实现）
-- CREATE USER kb_processor WITH PASSWORD 'kb_processor';
-- CREATE USER kb_vector WITH PASSWORD 'kb_vector';
-- CREATE USER kb_user_svc WITH PASSWORD 'kb_user_svc';
-- CREATE USER kb_rag WITH PASSWORD 'kb_rag';

-- 后续服务用户权限示例：
-- kb_processor: knowledge_clean, knowledge_structured, embed_task (INSERT only)
-- kb_vector: embed_task (UPDATE), knowledge_version (UPDATE status)
-- kb_user_svc: user_context_cache
-- kb_rag: knowledge_doc (SELECT), doc_acl (SELECT) - 只读
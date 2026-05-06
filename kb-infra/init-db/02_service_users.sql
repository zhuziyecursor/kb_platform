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
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.knowledge_doc TO kb_ingest;

-- 授予 doc_acl 表权限
GRANT SELECT, INSERT, UPDATE ON kb_knowledge.doc_acl TO kb_ingest;

-- 授予 knowledge_version 表权限（只能 INSERT）
GRANT SELECT, INSERT ON kb_knowledge.knowledge_version TO kb_ingest;

-- 创建 kb_processor 用户（文档处理服务）
CREATE USER kb_processor WITH PASSWORD 'kb_processor';
GRANT CONNECT ON DATABASE kb_knowledge TO kb_processor;

-- kb_processor 用户的表权限
GRANT USAGE ON SCHEMA kb_knowledge TO kb_processor;
GRANT SELECT, INSERT, UPDATE ON kb_knowledge.knowledge_clean TO kb_processor;
GRANT SELECT, INSERT, UPDATE ON kb_knowledge.knowledge_structured TO kb_processor;
GRANT SELECT, INSERT ON kb_knowledge.embed_task TO kb_processor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_processor;

-- 创建 kb_vector 用户（向量写入服务）
CREATE USER kb_vector WITH PASSWORD 'kb_vector';
GRANT CONNECT ON DATABASE kb_knowledge TO kb_vector;

-- kb_vector 用户的表权限
GRANT USAGE ON SCHEMA kb_knowledge TO kb_vector;
GRANT SELECT, UPDATE ON kb_knowledge.embed_task TO kb_vector;
GRANT SELECT, UPDATE ON kb_knowledge.knowledge_version TO kb_vector;
GRANT SELECT, UPDATE ON kb_knowledge.knowledge_doc TO kb_vector;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_vector;

-- 创建 kb_rag 用户（RAG 检索服务，只读）
CREATE USER kb_rag WITH PASSWORD 'kb_rag';
GRANT CONNECT ON DATABASE kb_knowledge TO kb_rag;

-- kb_rag 用户的表权限（只读）
GRANT USAGE ON SCHEMA kb_knowledge TO kb_rag;
GRANT SELECT ON kb_knowledge.doc_acl TO kb_rag;
GRANT SELECT ON kb_knowledge.knowledge_version TO kb_rag;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_rag;

-- 创建其他服务用户（占位，待后续实现）
-- CREATE USER kb_user_svc WITH PASSWORD 'kb_user_svc';
-- =============================================================================
-- KB Platform 数据库用户权限配置
-- 每个微服务使用独立的数据库用户，实现权限隔离
-- 权限范围对齐 CLAUDE.md "表所有权" 章节
-- =============================================================================

-- 辅助函数：安全创建用户（幂等）
CREATE OR REPLACE FUNCTION create_user_if_not_exists(username TEXT, password TEXT)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = username) THEN
    EXECUTE format('CREATE USER %I WITH PASSWORD %L', username, password);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. kb_ingest — 文档入库服务
-- =============================================================================
SELECT create_user_if_not_exists('kb_ingest', 'kb_ingest');
GRANT CONNECT ON DATABASE kb_knowledge TO kb_ingest;

-- kb_knowledge schema
GRANT USAGE ON SCHEMA kb_knowledge TO kb_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.knowledge_doc TO kb_ingest;
GRANT SELECT, INSERT ON kb_knowledge.knowledge_version TO kb_ingest;
GRANT SELECT, INSERT, UPDATE ON kb_knowledge.doc_acl TO kb_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.doc_perm_group TO kb_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.knowledge_space TO kb_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.space_acl TO kb_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_ingest;

-- kb_audit schema
GRANT USAGE ON SCHEMA kb_audit TO kb_ingest;
GRANT SELECT, INSERT, UPDATE ON kb_audit.kb_doc_audit TO kb_ingest;
GRANT SELECT, INSERT, UPDATE ON kb_audit.acl_change_history TO kb_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_audit TO kb_ingest;

-- =============================================================================
-- 2. kb_processor — 文档处理服务 (kb-doc-processor)
-- =============================================================================
SELECT create_user_if_not_exists('kb_processor', 'kb_processor');
GRANT CONNECT ON DATABASE kb_knowledge TO kb_processor;

-- kb_knowledge schema (写入: clean / structured / embed_task)
GRANT USAGE ON SCHEMA kb_knowledge TO kb_processor;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.knowledge_clean TO kb_processor;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.knowledge_structured TO kb_processor;
GRANT SELECT, INSERT, UPDATE ON kb_knowledge.embed_task TO kb_processor;
-- 只读 / 状态回写
GRANT SELECT, UPDATE ON kb_knowledge.knowledge_doc TO kb_processor;
GRANT SELECT, UPDATE ON kb_knowledge.knowledge_version TO kb_processor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_processor;

-- =============================================================================
-- 3. kb_vector — 向量写入服务 (vector-service)
-- =============================================================================
SELECT create_user_if_not_exists('kb_vector', 'kb_vector');
GRANT CONNECT ON DATABASE kb_knowledge TO kb_vector;

-- kb_knowledge schema
GRANT USAGE ON SCHEMA kb_knowledge TO kb_vector;
GRANT SELECT, UPDATE ON kb_knowledge.embed_task TO kb_vector;
GRANT SELECT, UPDATE ON kb_knowledge.knowledge_version TO kb_vector;
GRANT SELECT, UPDATE ON kb_knowledge.knowledge_doc TO kb_vector;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.knowledge_search_idx TO kb_vector;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_vector;

-- kb_audit schema (reconcile_log)
GRANT USAGE ON SCHEMA kb_audit TO kb_vector;
GRANT INSERT, SELECT ON kb_audit.reconcile_log TO kb_vector;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_audit TO kb_vector;

-- =============================================================================
-- 4. kb_rag — RAG 检索服务 (rag-service)
-- =============================================================================
SELECT create_user_if_not_exists('kb_rag', 'kb_rag');
GRANT CONNECT ON DATABASE kb_knowledge TO kb_rag;

-- kb_knowledge schema
GRANT USAGE ON SCHEMA kb_knowledge TO kb_rag;
-- 自有表 (CRUD)
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.rag_session TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.rag_message TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_knowledge.faq_knowledge TO kb_rag;
-- 只读表 (ACL 校验 / 检索 / 空间解析)
GRANT SELECT ON kb_knowledge.doc_acl TO kb_rag;
GRANT SELECT ON kb_knowledge.knowledge_version TO kb_rag;
GRANT SELECT ON kb_knowledge.knowledge_doc TO kb_rag;
GRANT SELECT ON kb_knowledge.knowledge_space TO kb_rag;
GRANT SELECT ON kb_knowledge.knowledge_structured TO kb_rag;
GRANT SELECT ON kb_knowledge.knowledge_search_idx TO kb_rag;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_rag;

-- kb_audit schema
GRANT USAGE ON SCHEMA kb_audit TO kb_rag;
GRANT SELECT, INSERT ON kb_audit.rag_pipeline_trace TO kb_rag;
GRANT SELECT, INSERT, UPDATE ON kb_audit.rag_feedback TO kb_rag;
GRANT SELECT, INSERT, UPDATE ON kb_audit.badcase_archive TO kb_rag;
GRANT SELECT, INSERT, UPDATE ON kb_audit.alert_log TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_audit.eval_dataset TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_audit.eval_qa_pair TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_audit.eval_run TO kb_rag;
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_audit.eval_qa_result TO kb_rag;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_audit TO kb_rag;

-- =============================================================================
-- 清理
-- =============================================================================
DROP FUNCTION create_user_if_not_exists;

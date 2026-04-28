-- =============================================================================
-- 企业 AI 知识库 - 索引优化脚本
-- =============================================================================
-- 说明：针对大表查询性能优化添加的索引
-- 执行时机：生产环境运行，可与补充脚本分开执行
-- =============================================================================

-- =============================================================================
-- 1. token_audit 表索引优化
-- =============================================================================

-- 复合索引：按租户+时间+结果快速查询（审计场景）
CREATE INDEX IF NOT EXISTS idx_token_audit_tenant_result 
    ON kb_auth.token_audit (tenant_id, ts DESC, result);

-- 复合索引：按用户+时间查询（用户行为分析）
CREATE INDEX IF NOT EXISTS idx_token_audit_uid_result 
    ON kb_auth.token_audit (uid, ts DESC, result);

-- 复合索引：按客户端+时间查询（客户端行为分析）
CREATE INDEX IF NOT EXISTS idx_token_audit_client_ts 
    ON kb_auth.token_audit (client_id, ts DESC);

-- 审计用索引：按错误码查询
CREATE INDEX IF NOT EXISTS idx_token_audit_error 
    ON kb_auth.token_audit (error_code, ts DESC) WHERE error_code IS NOT NULL;

-- =============================================================================
-- 2. kb_search_audit 表索引优化
-- =============================================================================

-- 复合索引：按租户+业务域+时间查询
CREATE INDEX IF NOT EXISTS idx_search_audit_tenant_biz 
    ON kb_audit.kb_search_audit (tenant_id, biz_domain, ts DESC);

-- 复合索引：按会话聚合查询
CREATE INDEX IF NOT EXISTS idx_search_audit_session 
    ON kb_audit.kb_search_audit (tenant_id, session_id, ts DESC) 
    WHERE session_id IS NOT NULL;

-- 审计用索引：按结果类型查询
CREATE INDEX IF NOT EXISTS idx_search_audit_result 
    ON kb_audit.kb_search_audit (result, ts DESC);

-- 审计用索引：按拒绝数查询（排查权限问题）
CREATE INDEX IF NOT EXISTS idx_search_audit_denied 
    ON kb_audit.kb_search_audit (tenant_id, denied_count, ts DESC) 
    WHERE denied_count > 0;

-- =============================================================================
-- 3. kb_user 表索引优化
-- =============================================================================

-- 用户表：按部门查询成员
CREATE INDEX IF NOT EXISTS idx_user_dept_member 
    ON kb_user.user_dept (dept_id, is_primary);

-- 用户表：按手机号/邮箱查询（登录场景）
CREATE INDEX IF NOT EXISTS idx_user_phone 
    ON kb_user."user" (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_email 
    ON kb_user."user" (email) WHERE email IS NOT NULL;

-- 用户表：按状态批量查询
CREATE INDEX IF NOT EXISTS idx_user_status 
    ON kb_user."user" (status, tenant_id);

-- 角色权限表：按权限码查询所有角色
CREATE INDEX IF NOT EXISTS idx_role_perm_perm 
    ON kb_user.role_permission (perm_code, scope);

-- 权限组成员表：按 accessor_id 查询
CREATE INDEX IF NOT EXISTS idx_perm_member_accessor 
    ON kb_user.perm_group_member (accessor_type, accessor_id);

-- =============================================================================
-- 4. kb_knowledge 表索引优化
-- =============================================================================

-- 文档元数据：按sha256查重
CREATE INDEX IF NOT EXISTS idx_doc_sha256 
    ON kb_knowledge.knowledge_doc (tenant_id, sha256) WHERE sha256 IS NOT NULL;

-- 文档元数据：按业务域+地域查询
CREATE INDEX IF NOT EXISTS idx_doc_domain_region 
    ON kb_knowledge.knowledge_doc (tenant_id, biz_domain, region_code, status);

-- 文档元数据：按有效期查询（制度类文档）
CREATE INDEX IF NOT EXISTS idx_doc_effective 
    ON kb_knowledge.knowledge_doc (tenant_id, effective_from, effective_to) 
    WHERE effective_to IS NOT NULL OR effective_from IS NOT NULL;

-- 清洗层：按文档查询清洗记录
CREATE INDEX IF NOT EXISTS idx_clean_doc 
    ON kb_knowledge.knowledge_clean (tenant_id, doc_id, created_time DESC);

-- 结构化层：按文档查询结构化数据
CREATE INDEX IF NOT EXISTS idx_structured_doc 
    ON kb_knowledge.knowledge_structured (tenant_id, doc_id, version DESC);

-- 版本表：按状态查询待处理版本
CREATE INDEX IF NOT EXISTS idx_version_pending 
    ON kb_knowledge.knowledge_version (tenant_id, status, created_at) 
    WHERE status IN ('PENDING', 'FAILED');

-- ACL表：按权限查询文档
CREATE INDEX IF NOT EXISTS idx_acl_permission 
    ON kb_knowledge.doc_acl (tenant_id, permission);

-- =============================================================================
-- 5. JTI 黑名单表索引
-- =============================================================================

-- 用于清理过期 JTI
CREATE INDEX IF NOT EXISTS idx_jti_active 
    ON kb_auth.jti_blacklist (jti, expire_at) 
    WHERE expire_at > now();

-- =============================================================================
-- 6. 文档操作审计表索引（补充表）
-- =============================================================================

-- 如果已执行补充脚本，此处为保险索引
CREATE INDEX IF NOT EXISTS idx_doc_audit_success 
    ON kb_audit.kb_doc_audit (tenant_id, result, ts DESC);

CREATE INDEX IF NOT EXISTS idx_doc_audit_doc_version 
    ON kb_audit.kb_doc_audit (tenant_id, doc_id, version, ts DESC);

-- =============================================================================
-- 7. 嵌入任务表索引（补充表）
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_embed_task_stale 
    ON kb_knowledge.embed_task (status, updated_at) 
    WHERE status = 'PENDING' AND updated_at < now() - INTERVAL '10 minutes';

CREATE INDEX IF NOT EXISTS idx_embed_task_failed 
    ON kb_knowledge.embed_task (status, retry_count) 
    WHERE status = 'FAILED' AND retry_count < max_retries;

-- =============================================================================
-- 8. 用户上下文缓存表索引（补充表）
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_user_ctx_dept 
    ON kb_user.user_context_cache USING GIN (dept_ids);

CREATE INDEX IF NOT EXISTS idx_user_ctx_perm_group 
    ON kb_user.user_context_cache USING GIN (perm_group_ids);

-- =============================================================================
-- 9. ACL变更历史表索引（补充表）
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_acl_history_accessor 
    ON kb_audit.acl_change_history (tenant_id, accessor_type, accessor_id, ts DESC);

-- =============================================================================
-- 10. 向量任务相关性索引（可选，用于性能分析）
-- =============================================================================

-- 用于分析任务处理延迟
CREATE INDEX IF NOT EXISTS idx_embed_task_latency 
    ON kb_knowledge.embed_task (tenant_id, created_at, processed_at) 
    WHERE status = 'DONE';

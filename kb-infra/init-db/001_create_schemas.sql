-- =============================================================================
-- 企业 AI 知识库 - 数据库初始化脚本
-- =============================================================================
-- 执行顺序: PostgreSQL 首次启动时, 按 init-db/ 目录下文件名字母序自动执行
-- 注意: 仅在数据卷为空时执行, 重复启动不会重复执行
-- =============================================================================

-- 创建 schema (按领域隔离)
CREATE SCHEMA IF NOT EXISTS kb_auth;      -- 认证与鉴权
CREATE SCHEMA IF NOT EXISTS kb_user;      -- 用户与组织
CREATE SCHEMA IF NOT EXISTS kb_knowledge; -- 知识元数据
CREATE SCHEMA IF NOT EXISTS kb_audit;     -- 审计日志

COMMENT ON SCHEMA kb_auth IS '认证适配器: OAuth client, token审计, 密钥管理';
COMMENT ON SCHEMA kb_user IS '用户服务: 组织/用户/角色/权限组';
COMMENT ON SCHEMA kb_knowledge IS '知识库: 文档元数据/清洗/结构化/版本/ACL';
COMMENT ON SCHEMA kb_audit IS '审计: 搜索审计/操作审计';

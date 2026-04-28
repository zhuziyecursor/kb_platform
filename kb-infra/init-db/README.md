# 企业AI知识库 - 数据库初始化说明

## 📁 文件结构

```
init-db/
├── 001_create_schemas.sql          # Schema 创建
├── 002_auth_tables.sql              # 认证服务表 (kb_auth)
├── 003_user_tables.sql              # 用户服务表 (kb_user)
├── 004_knowledge_tables.sql         # 知识库表 (kb_knowledge)
├── 005_audit_tables.sql            # 审计表 (kb_audit)
└── updates/
    ├── 006_supplement_tables.sql    # 补充表 (MVP必需)
    └── 007_performance_indexes.sql # 索引优化
```

## 🚀 执行顺序

### 生产环境首次部署
```bash
# 1. 执行基础脚本
psql -h localhost -U postgres -d kb_platform -f 001_create_schemas.sql
psql -h localhost -U postgres -d kb_platform -f 002_auth_tables.sql
psql -h localhost -U postgres -d kb_platform -f 003_user_tables.sql
psql -h localhost -U postgres -d kb_platform -f 004_knowledge_tables.sql
psql -h localhost -U postgres -d kb_platform -f 005_audit_tables.sql

# 2. 执行补充脚本 (MVP必需)
psql -h localhost -U postgres -d kb_platform -f updates/006_supplement_tables.sql

# 3. 执行索引优化 (可选，建议生产环境执行)
psql -h localhost -U postgres -d kb_platform -f updates/007_performance_indexes.sql
```

### Docker Compose / K8s 初始化
```yaml
# docker-compose.yml 示例
services:
  postgres:
    image: postgres:15
    volumes:
      - ./init-db:/docker-entrypoint-initdb.d
```

## 📊 表清单

### kb_auth (认证适配器)
| 表名 | 用途 | 优先级 |
|------|------|--------|
| oauth_client | OAuth2 客户端注册 | 必须 |
| key_store | JWT 密钥管理 (kid 轮换) | 必须 |
| token_audit | Token 签发审计 | 必须 |
| jti_blacklist | JWT JTI 黑名单 (紧急吊销) | 必须 |

### kb_user (用户服务)
| 表名 | 用途 | 优先级 |
|------|------|--------|
| tenant | 租户 | 必须 |
| org_dept | 组织部门 (ltree) | 必须 |
| user | 用户 | 必须 |
| user_dept | 用户-部门关联 | 必须 |
| role | 角色 | 必须 |
| user_role | 用户-角色关联 | 必须 |
| permission | 权限定义 | 必须 |
| role_permission | 角色-权限关联 | 必须 |
| perm_group | 权限组 (解决 Milvus expr 过长) | 必须 |
| perm_group_member | 权限组成员 | 必须 |
| user_context_cache | 用户上下文缓存 (补充) | 建议 |

### kb_knowledge (知识库)
| 表名 | 用途 | 优先级 |
|------|------|--------|
| knowledge_doc | 文档元数据主表 | 必须 |
| knowledge_clean | 清洗层数据 | 必须 |
| knowledge_structured | 结构化层数据 | 必须 |
| knowledge_version | 文档版本状态机 | 必须 |
| doc_acl | 文档 ACL | 必须 |
| embed_task | 嵌入任务队列 (补充) | MVP必需 |
| doc_perm_group | 文档-权限组关联 (补充) | 建议 |

### kb_audit (审计)
| 表名 | 用途 | 优先级 |
|------|------|--------|
| kb_search_audit | 搜索审计 | 必须 |
| kb_doc_audit | 文档操作审计 (补充) | MVP必需 |
| acl_change_history | ACL变更历史 (补充) | 建议 |

## 🔧 与技术方案的对应关系

| 方案章节 | 对应表 | 验证状态 |
|----------|--------|----------|
| 3.1 知识分层模型 | knowledge_doc, knowledge_clean, knowledge_structured | ✅ |
| 3.4 向量数据库 | Milvus (外部)，metadata 字段在 doc/embed_task | ✅ |
| 4.1 统一认证 | oauth_client, key_store, token_audit | ✅ |
| 4.2 权限模型 | role, permission, role_permission, perm_group | ✅ |
| 4.3 知识权限 | doc_acl, doc_perm_group, perm_group_member | ✅ |
| 5.2 文档入库 | knowledge_version, embed_task | ✅ |
| 5.4 生命周期 | kb_doc_audit (offboard/delete/revoke) | ✅ |
| 6.1 可观测性 | kb_search_audit, kb_doc_audit, token_audit | ✅ |

## 📝 踩坑记录

### PostgreSQL ltree 扩展
- 部门表使用 `ltree` 类型存储部门路径
- 需要执行 `CREATE EXTENSION IF NOT EXISTS ltree;`
- 查询子部门使用 `@>` 操作符

### JSONB 字段索引
- 用户上下文缓存表使用 GIN 索引加速 JSONB 查询
- `dept_ids`, `perm_group_ids` 等数组字段使用 GIN 索引

### 分区表注意事项
- `token_audit` 和 `kb_search_audit` 建议按月分区
- 分区脚本在 `006_supplement_tables.sql` 末尾（已注释）
- 建议配合 `pg_cron` 自动创建新分区

## 🔍 验证脚本

```sql
-- 验证所有表是否创建成功
SELECT
    table_schema,
    table_name
FROM information_schema.tables
WHERE table_schema IN ('kb_auth', 'kb_user', 'kb_knowledge', 'kb_audit')
ORDER BY table_schema, table_name;

-- 验证预置数据
SELECT * FROM kb_user.role;
SELECT * FROM kb_user.permission;
SELECT * FROM kb_user.role_permission;
```

## ⚠️ 注意事项

1. **执行顺序**：必须按数字顺序执行
2. **权限**：执行用户需要有创建 schema 和表的权限
3. **PostgreSQL 版本**：建议 PostgreSQL 15+
4. **字符集**：建议使用 UTF-8
5. **时区**：建议统一使用 UTC 或 Asia/Shanghai

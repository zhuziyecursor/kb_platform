# user-service 开发规则

## 服务职责

用户上下文聚合、perm_group 管理。

**只管用户/权限数据，不涉及任何知识库业务逻辑。**

## 本服务拥有的表

| 表名 | Schema | 操作权限 |
|------|--------|---------|
| `user_context_cache` | kb_user | SELECT, INSERT, UPDATE, DELETE |

DB 用户：`kb_user_svc`（见 `kb-infra/init-db/02_service_users.sql`）

## 禁止访问的表

- 所有 `kb_knowledge.*` 表（知识库业务表）

## Kafka 消费规则

消费 `user-cud` topic（用户变更事件），同步更新 `user_context_cache`。

## perm_group_id 计算（核心逻辑）

```
perm_group_id = hash(tenant_id + accessor_type + accessor_id) % 2^63
```

用户登录或上下文刷新时：
1. 查询用户所有关联的 ROLE、DEPT、USER 类型的 doc_acl 记录
2. 将每条记录计算 perm_group_id
3. 去重后存入 `user_context_cache.perm_group_ids`（BIGINT[]）

## 对外接口

提供内部接口供 auth-adapter 在 Token Exchange 时调用，获取 perm_group_ids：
- `GET /internal/users/{uid}/context?tenant_id={tenant_id}`

## 缓存策略

- Redis 缓存用户上下文（TTL 建议与 OBO token exp 对齐，5~10 分钟）
- 用户权限变更时通过 user-cud 事件失效缓存

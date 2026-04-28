# kb-gateway 开发规则

## 服务职责

入口鉴权：校验所有进入 KB 系统的请求的 Token 合法性。

**只做校验，不执行任何业务逻辑。**

## 校验职责

1. `iss` 白名单校验（只接受已知 OIDC 颁发方）
2. `aud` 路由隔离（aud=mcp-kb 才路由到 KB 服务）
3. `scope` 权限校验（kb:upload / kb:search）
4. `tenant` 绑定（tenant_id 必须存在且有效）
5. 剥离自定义用户头（StripCustomUserHeaderFilter，优先级最高）

## 禁止的行为

- 禁止在 gateway 中写任何业务逻辑（不查数据库、不调业务服务）
- 禁止在 gateway 中修改请求 body
- 禁止在 gateway 中缓存 token（只做验证，缓存由 auth-adapter 负责）

## StripCustomUserHeaderFilter（必须实现）

网关必须在所有请求转发前，去除以下 HTTP header：
```
x-user-id, x-tenant-id, x-roles, x-dept-id, x-sec-level, x-perm-group-ids
```
优先级：`Ordered.HIGHEST_PRECEDENCE`，确保在所有业务 filter 之前执行。

## 路由规则

| 路由 | 目标服务 | scope 要求 |
|-----|---------|-----------|
| /kb/v1/** | ingest-service | kb:upload |
| /rag/v1/** | rag-service | kb:search |
| /user/v1/** | user-service | openid |

## 本服务不拥有任何数据库表

gateway 无 DB 连接，无 JPA/JDBC 依赖。

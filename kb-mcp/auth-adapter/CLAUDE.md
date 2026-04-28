# auth-adapter 开发规则

## 服务职责

认证适配层：提供 OIDC 标准端点、OBO Token Exchange、桥接公司 BladeX OAuth2 系统。

**只做认证，不执行任何业务逻辑，不调用任何业务服务。**

## 核心功能（MVP 一期）

1. OIDC 标准端点（/.well-known/openid-configuration 等）
2. OBO Token Exchange（RFC 8693）：
   - 输入：`user_access_token`（aud=kb-portal-client）
   - 输出：`obo_access_token`（aud=mcp-kb，exp=5min）
   - OBO token 必须包含：`tenant_id, uid, role_codes, dept_ids, sec_level, perm_group_ids`
3. 桥接 BladeX OAuth2（上游 OAuth2 + userinfo/introspection）
4. JWKS 缓存（Redis，TTL 建议 10 分钟）

## OBO Token 字段规范

```json
{
  "iss": "https://auth-adapter.example.com",
  "sub": "u123",
  "aud": "mcp-kb",
  "exp": "<now + 5min>",
  "scope": "kb:search 或 kb:upload",
  "tenant_id": "t1",
  "uid": "u123",
  "role_codes": ["USER"],
  "dept_ids": ["D01"],
  "sec_level": 3,
  "perm_group_ids": [101, 102]
}
```

## perm_group_id 聚合逻辑

在 Token Exchange 时，user-service 负责聚合：
1. 查询用户关联的所有 ROLE、DEPT、USER 类型的 doc_acl 记录
2. 计算 `perm_group_id = hash(tenant_id + accessor_type + accessor_id) % 2^63`
3. 去重后写入 OBO token 的 `perm_group_ids` 字段

## 禁止的行为

- 禁止调用 ingest-service / rag-service / vector-service 等业务服务
- 禁止在 auth-adapter 中存储文档相关数据
- 禁止修改 OBO token 的 `aud`（固定为 `mcp-kb`）

## 本服务拥有的表

无业务表。仅使用 Redis 缓存 JWKS（key: `jwks:{iss}`）。

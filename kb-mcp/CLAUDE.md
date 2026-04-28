# kb-mcp Java 微服务通用规则

> 本文件规则适用于所有 Java 微服务（kb-gateway, auth-adapter, user-service, ingest-service, vector-service, rag-service）。
> 各服务子目录的 CLAUDE.md 在此基础上追加服务特定规则。

---

## 技术栈规范

- Java 17
- Spring Boot 3.2.x
- Spring Cloud Gateway（仅 kb-gateway 使用）
- Spring Data JPA / JDBC（按各服务的表所有权使用）
- Kafka：Spring Kafka
- 测试：JUnit 5 + ArchUnit（架构守护测试）

---

## DB 访问规则

1. **每个服务只能使用自己专属的数据库用户**（见根目录 CLAUDE.md 中"表所有权"章节）
2. `application.yml` 中的 `spring.datasource.username` 禁止修改为其他服务的用户
3. 禁止在代码中硬编码数据库连接字符串或密码
4. 配置通过环境变量注入：`${DB_USERNAME}`, `${DB_PASSWORD}`, `${DB_URL}`

## OBO Token 解析规范

- 所有服务从 JWT claims 解析用户上下文，禁止读取自定义 HTTP header
- 标准解析路径：`SecurityContextHolder.getContext().getAuthentication()` 中获取 claims
- 必须验证的 claims：`aud=mcp-kb`, `exp`（未过期），`tenant_id`

## 错误响应规范

统一错误响应格式：
```json
{
  "code": "ERROR_CODE",
  "message": "用户可读的错误信息",
  "traceId": "tr-xxx"
}
```

## ArchUnit 架构守护测试

每个服务必须包含 `*ArchTest.java`，至少包含以下测试：
- 本服务不存在违反"绝对禁止调用"的依赖
- `@Phase2Feature` 注解的类不被一期代码调用

## 幂等性原则

所有写入操作必须考虑幂等性。使用数据库唯一约束 + 业务唯一键（而非仅依赖主键）保证幂等。

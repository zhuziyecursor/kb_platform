# KB Platform 本地开发指南

## 前端直连 ingest-service（跳过 kb-gateway）

### 背景

MVP 一期阶段，前端直接请求 ingest-service，跳过 kb-gateway 鉴权流程，便于快速迭代开发。

**权限功能（JWT/OAuth2）将于 PHASE2 接入，届时前端需改回通过 kb-gateway 访问。**

---

### 后端修改（ingest-service）

#### 1. 禁用 OAuth2 安全依赖

**文件：** `kb-mcp/ingest-service/pom.xml`

```xml
<!-- TODO: PHASE2: 权限开发时启用
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
-->
```

#### 2. 临时移除 JWT 注解，使用 Mock TenantId

**文件：** `kb-mcp/ingest-service/src/main/java/com/kb/ingest/controller/SpaceController.java`

```java
// TODO: PHASE2 权限开发时，从 JWT token 解析 tenant_id
private static final String DEV_TENANT_ID = "dev-tenant-001";
```

#### 3. 配置 CORS（允许前端跨域访问）

**新增文件：** `kb-mcp/ingest-service/src/main/java/com/kb/ingest/config/CorsConfig.java`

```java
@Configuration
public class CorsConfig {
    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        config.addAllowedOriginPattern("*");
        config.addAllowedHeader("*");
        config.addAllowedMethod("*");

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}
```

#### 4. 启动命令

```bash
cd kb-mcp/ingest-service

# 构建
mvn clean package -DskipTests -q

# 启动（指定数据库连接）
DB_HOST=localhost DB_PORT=25432 DB_NAME=knowledge \
DB_USERNAME=kb_ingest DB_PASSWORD=kb_ingest \
java -jar target/ingest-service-0.0.1-SNAPSHOT.jar
```

---

### 前端修改

#### 修改 API BaseURL

**文件：** `kb-portal/web/src/api/http-client.ts`

```typescript
const httpClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8081',  // 改为 8081
  timeout: 10000,
});
```

**注意：** 后续接入 kb-gateway 时，将 `8081` 改回 `8080` 即可。

---

### 数据库初始化（如未创建）

```bash
# 进入 postgres 容器
docker exec -it kb-postgres psql -U kb_admin -d knowledge

# 1. 创建 kb_ingest 用户
CREATE USER kb_ingest WITH PASSWORD 'kb_ingest';
GRANT CONNECT ON DATABASE knowledge TO kb_ingest;

# 2. 创建 knowledge_space 表
CREATE TABLE kb_knowledge.knowledge_space (
    id              VARCHAR(64) PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     VARCHAR(512),
    chunk_size      INT NOT NULL DEFAULT 512,
    overlap_ratio   INT NOT NULL DEFAULT 10,
    chunk_mode      VARCHAR(16) NOT NULL DEFAULT 'HEAD_FIRST',
    visibility      VARCHAR(16) NOT NULL DEFAULT 'TEAM',
    create_time     TIMESTAMP NOT NULL DEFAULT now(),
    update_time     TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

# 3. 授权
GRANT USAGE ON SCHEMA kb_knowledge TO kb_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kb_knowledge TO kb_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA kb_knowledge TO kb_ingest;

# 4. 添加 knowledge_space_id 列（如 knowledge_doc 表已存在）
ALTER TABLE kb_knowledge.knowledge_doc ADD COLUMN IF NOT EXISTS knowledge_space_id VARCHAR(64);
```

---

### 快速启动脚本

```bash
# 1. 启动基础设施（如果未启动）
cd kb-infra && docker compose up -d

# 2. 初始化数据库（如未初始化）
docker exec kb-postgres psql -U kb_admin -d knowledge -c "CREATE TABLE IF NOT EXISTS kb_knowledge.knowledge_space ..."

# 3. 构建并启动 ingest-service
cd kb-mcp/ingest-service
mvn clean package -DskipTests -q
DB_HOST=localhost DB_PORT=25432 DB_NAME=knowledge DB_USERNAME=kb_ingest DB_PASSWORD=kb_ingest \
java -jar target/ingest-service-0.0.1-SNAPSHOT.jar

# 4. 启动前端
cd kb-portal/web && npm run dev
```

---

### PHASE2 恢复鉴权步骤

1. 取消 `pom.xml` 中 oauth2-resource-server 依赖的注释
2. 恢复 `SpaceController.java` 中的 `@AuthenticationPrincipal Jwt jwt` 注解和 JWT 解析逻辑
3. 前端 `http-client.ts` 的 baseURL 改回 `8080`
4. 删除 `CorsConfig.java`（kb-gateway 会处理跨域）

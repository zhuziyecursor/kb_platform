# Grafana + Loki + Promtail 可观测性平台技术方案

> **状态**: 待评审  
> **日期**: 2026-05-14  
> **目标**: 为 kb-platform 所有 8 个服务建立统一的日志采集、存储、查询与可视化平台

---

## 目录

1. [架构总览](#1-架构总览)
2. [资源评估](#2-资源评估)
3. [基础设施部署](#3-基础设施部署)
4. [日志标准化规范](#4-日志标准化规范)
5. [各服务改造方案](#5-各服务改造方案)
6. [Promtail 采集配置](#6-promtail-采集配置)
7. [Grafana 仪表盘方案](#7-grafana-仪表盘方案)
8. [实施步骤](#8-实施步骤)
9. [运维手册](#9-运维手册)

---

## 1. 架构总览

### 1.1 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      应用服务 (宿主机)                        │
│                                                             │
│  ingest-service ──→ .dev.log                                │
│  vector-service ──→ .dev.log                                │
│  rag-service    ──→ .dev.log                                │
│  llm-gateway    ──→ .dev.log                                │
│  doc-processor  ──→ .dev.log                                │
│  rerank-service ──→ .dev.log                                │
│  kb-portal      ──→ .dev.log                                │
│  public-api     ──→ .dev.log                                │
│                       │                                     │
│                   Promtail (宿主机进程)                        │
│                   tail + scrape                              │
│                       │                                     │
└───────────────────────┼─────────────────────────────────────┘
                        │ Loki Push API (HTTP)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   Docker 容器 (kb-infra)                      │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐                        │
│  │    Loki      │◄───│   Grafana    │──→ 浏览器 :3100        │
│  │  :31008     │    │   :31009     │                        │
│  │  write path │    │   dashboards │                        │
│  └──────┬──────┘    └──────────────┘                        │
│         │ S3 (MinIO)                                         │
│         ▼                                                   │
│  ┌──────────┐                                               │
│  │  MinIO    │  索引 + chunks 持久化                          │
│  │  :29000   │  bucket: loki-data                            │
│  └──────────┘                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 组件职责

| 组件 | 部署方式 | 端口 | 职责 |
|------|---------|------|------|
| **Promtail** | 宿主机进程 (brew install) | — | 采集所有服务的 .dev.log 文件 + Docker 容器日志，推送到 Loki |
| **Loki** | Docker 容器 | 31008 | 日志存储 + 索引（仅索引 label，不索引内容） |
| **Grafana** | Docker 容器 | 31009 | 日志查询 UI + 仪表盘 + 告警 |

### 1.3 关键设计决策

**为什么 Promtail 跑在宿主机而不是 Docker？**

所有应用服务在开发环境直接在宿主机运行（`start-all.sh` 通过 `mvn spring-boot:run` / `python -m src.main` 启动），日志写到各自目录下的 `.dev.log`。Promtail 需要能读到这些宿主机路径。如果 Promtail 跑在 Docker 里，需要 mount 大量宿主机目录，配置复杂。宿主机直接跑 Promtail 是最简单的方案。

**为什么 Loki 用 MinIO 而不是本地文件系统？**

你们已有 MinIO，直接复用。本地文件系统方案在 Docker 容器重启后日志丢失（除非 mount volume）。用 MinIO 则 Loki 数据天然持久化，且后续可扩展为多租户 Loki 集群。

---

## 2. 资源评估

### 2.1 日志量估算

假设日活跃开发者 5 人，日均 200 次 RAG 对话 + 50 次文档上传：

| 日志类别 | 单次调用日志行数 | 日均量 |
|---------|----------------|--------|
| Access Log | 1 条/请求 | ~2,000 条 |
| Trace Log (链路 A) | 6 条/对话 | ~1,200 条 |
| Trace Log (链路 B) | 5 条/上传 | ~250 条 |
| App Log | 30 条/服务/天 | ~240 条 |
| Error Log | 按需 | ~50 条 |
| Infra Log | Docker 容器持续输出 | ~5,000 条 |
| **合计** | | **~8,700 条/天** |

每条日志 JSON 格式约 300-500 字节，日均数据量约 **4MB**。

### 2.2 存储估算

| 保留天数 | 原始数据量 | Loki 压缩后 (gzip) | 索引开销 |
|---------|-----------|-------------------|---------|
| 30 天 | ~120MB | ~40MB | ~20MB |
| 90 天 | ~360MB | ~120MB | ~60MB |

### 2.3 容器资源配置

| 容器 | CPU Limit | Memory Limit | 说明 |
|------|----------|-------------|------|
| Loki | 0.5 | 256MB | 单实例模式，足够 |
| Grafana | 0.5 | 256MB | 基础 UI，不含大插件 |
| **新增总计** | **1.0 CPU** | **512MB** | 对现有 macOS 16GB 环境无压力 |

---

## 3. 基础设施部署

### 3.1 Docker Compose 新增服务

在 `kb-infra/docker-compose/docker-compose.yml` 中追加：

```yaml
# =============================================================================
# Grafana + Loki — 可观测性平台 (日志聚合 + 可视化)
# =============================================================================
# 用途:
#   - Loki: 日志聚合存储，索引 label，不索引日志正文
#   - Grafana: 日志查询 UI + 仪表盘 + 告警
# 设计:
#   - Loki 使用 MinIO 作为对象存储（复用已有 MinIO）
#   - Grafana 仪表盘通过 provisioning 自动加载，重建容器不丢失
#   - 日志保留 30 天（开发环境），生产环境可延长
#   - Promtail 在宿主机运行（非 Docker），tail 应用服务的 .dev.log
# =============================================================================

  loki:
    image: grafana/loki:3.2.0
    container_name: kb-loki
    restart: unless-stopped
    ports:
      - "${LOKI_PORT:-31008}:3100"
    command:
      - -config.file=/etc/loki/loki-config.yaml
      - -config.expand-env=true
    environment:
      LOKI_S3_ENDPOINT: minio:9000
      LOKI_S3_ACCESS_KEY: ${MINIO_ROOT_USER:-kb_minio_admin}
      LOKI_S3_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-kb_minio_admin_dev}
      LOKI_RETENTION_DAYS: "30"
    volumes:
      - ./configs/loki/loki-config.yaml:/etc/loki/loki-config.yaml:ro
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3100/ready"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 15s
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
        reservations:
          cpus: "0.25"
          memory: 128M
    networks:
      - kb-network
    stop_grace_period: 10s

  grafana:
    image: grafana/grafana:11.3.0
    container_name: kb-grafana
    restart: unless-stopped
    ports:
      - "${GRAFANA_PORT:-31009}:3000"
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: "Admin"
      GF_USERS_DEFAULT_THEME: "light"
      GF_INSTALL_PLUGINS: ""
      GF_SERVER_ROOT_URL: "%(protocol)s://%(domain)s:%(http_port)s/"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./configs/grafana/datasources:/etc/grafana/provisioning/datasources:ro
      - ./configs/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 15s
    depends_on:
      loki:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
        reservations:
          cpus: "0.25"
          memory: 128M
    networks:
      - kb-network
    stop_grace_period: 10s
```

volumes 中追加：

```yaml
  grafana_data:
    driver: local
```

### 3.2 Loki 配置文件

新建 `kb-infra/docker-compose/configs/loki/loki-config.yaml`：

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096
  log_level: info

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: "2026-01-01"
      store: tsdb
      object_store: s3
      schema: v13
      index:
        prefix: loki_index_
        period: 24h

storage_config:
  tsdb_shipper:
    active_index_directory: /loki/index
    cache_location: /loki/cache
  aws:
    s3: "s3://${LOKI_S3_ACCESS_KEY}:${LOKI_S3_SECRET_KEY}@${LOKI_S3_ENDPOINT}/loki-data"
    s3forcepathstyle: true
    bucketnames: loki-data
    region: us-east-1

limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  allow_structured_metadata: true
  max_entries_limit_per_query: 5000
  retention_period: "${LOKI_RETENTION_DAYS}d"

compactor:
  working_directory: /loki/compactor
  compaction_interval: 10m
  retention_enabled: true
  delete_request_store: s3

query_scheduler:
  max_outstanding_requests_per_tenant: 256

analytics:
  reporting_enabled: false
```

**关键配置说明**：

- `schema: v13` — TSDB 索引格式，Loki 3.x 默认，写入效率最佳
- `allow_structured_metadata: true` — 允许在查询时按 metadata 过滤（我们用它存 `user_id`、`doc_id` 等不需要建索引的高基数字段）
- `retention_period: 30d` — 自动删除 30 天前的日志
- `s3forcepathstyle: true` — MinIO 兼容模式

### 3.3 Grafana 数据源 Provisioning

新建 `kb-infra/docker-compose/configs/grafana/datasources/loki.yaml`：

```yaml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: true
    editable: false
    jsonData:
      maxLines: 1000
      derivedFields:
        - matcherRegex: "trace_id=(tr-[a-f0-9-]+)"
          name: TraceID
          url: ""
```

### 3.4 Grafana 仪表盘 Provisioning

新建 `kb-infra/docker-compose/configs/grafana/dashboards/default.yaml`：

```yaml
apiVersion: 1

providers:
  - name: "kb-platform"
    orgId: 1
    folder: "KB Platform"
    type: file
    disableDeletion: true
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

---

## 4. 日志标准化规范

### 4.1 统一日志格式 (JSON)

所有服务必须输出 **单行 JSON** 到 stdout/stderr。Promtail 通过正则/JSON 解析器提取字段。

**必选字段** (7 个)：

```json
{
  "ts": "2026-05-14T10:23:45.123+08:00",
  "level": "INFO",
  "service": "rag-service",
  "logger": "com.kb.rag.service.ChatServiceImpl",
  "trace_id": "tr-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "msg": "RAG retrieval completed",
  "event_type": "trace"
}
```

| 字段 | 含义 | 示例值 | Promtail 映射 |
|------|------|--------|-------------|
| `ts` | ISO 8601 时间戳（含时区） | `2026-05-14T10:23:45.123+08:00` | Label: `ts` (自动解析) |
| `level` | 日志级别 | `DEBUG`, `INFO`, `WARN`, `ERROR` | Label: `level` |
| `service` | 服务名称 | `rag-service` | Label: `service` |
| `logger` | 类/模块全限定名 | `com.kb.rag.service.ChatServiceImpl` | Label: `logger` |
| `trace_id` | 全链路追踪 ID | `tr-a1b2c3d4-...` | Structured Metadata: `trace_id` |
| `msg` | 日志正文（人类可读） | `RAG retrieval completed` | 日志内容 |
| `event_type` | 日志五大类别 | `access`, `trace`, `app`, `error`, `infra` | Label: `event_type` |

**可选扩展字段** (按场景附加)：

| 字段 | 适用场景 | 示例值 |
|------|---------|--------|
| `span` | trace 日志 | `bm25_search` |
| `duration_ms` | trace/access | `245` |
| `user_id` | access | `uid-xxx` |
| `tenant_id` | access/error | `t-xxx` |
| `method` | access | `POST` |
| `path` | access | `/api/v1/rag/chat` |
| `status_code` | access/error | `200` |
| `doc_id` | trace(App B) | `doc-xxx` |
| `model` | trace(App A, llm) | `qwen-max` |
| `tokens` | trace(App A, llm) | `{"prompt":1024,"completion":512}` |
| `error_code` | error | `MILVUS_TIMEOUT` |
| `stack_trace` | error | 异常堆栈（单行，换行符转义） |
| `cache_hit` | trace | `true` |
| `recall_count` | trace | `15` |

### 4.2 Label 体系设计

Promtail 推送到 Loki 时，字段分为两层：

**Label** (索引，用于过滤/分组，必须低基数，建议 `<10` 种取值)：

| Label | 取值 | 基数 | 用途 |
|-------|------|------|------|
| `service` | `ingest-service`, `vector-service`, `rag-service`, `llm-gateway`, `kb-doc-processor`, `rerank-service`, `kb-portal`, `public-api` | 8 | 按服务过滤 |
| `level` | `DEBUG`, `INFO`, `WARN`, `ERROR` | 4 | 按级别过滤 |
| `event_type` | `access`, `trace`, `app`, `error`, `infra` | 5 | 按日志类别过滤 |
| `span` | `bm25_search`, `vector_search`, `rerank`, `llm_call` 等 | ~15 | 按环节过滤 |

**Structured Metadata** (不索引，仅查询时过滤，适合高基数字段)：

| Metadata Key | 基数 | 示例 |
|-------------|------|------|
| `trace_id` | 极高 | `tr-abc123...` |
| `user_id` | 中 | `uid-xxx` |
| `doc_id` | 中 | `doc-xxx` |
| `error_code` | 低-中 | `MILVUS_TIMEOUT` |
| `status_code` | 极低 | `200` |
| `model` | 极低 | `qwen-max` |

---

## 5. 各服务改造方案

### 5.1 Java 服务统一改造 (6 个服务)

#### 5.1.1 统一 logback-spring.xml

为 **ingest-service**, **vector-service**, **rag-service**, **llm-gateway**, **public-api** 各创建相同的 `logback-spring.xml`。以 `rag-service` 为例：

文件位置: `kb-mcp/rag-service/src/main/resources/logback-spring.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- JSON 控制台输出 (Promtail 采集) -->
    <appender name="CONSOLE_JSON" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <customFields>{"service":"rag-service"}</customFields>
            <fieldNames>
                <timestamp>ts</timestamp>
                <version>[ignore]</version>
                <levelValue>[ignore]</levelValue>
            </fieldNames>
        </encoder>
    </appender>

    <!-- 文件 JSON 输出 (兜底，Promtail 也可读) -->
    <appender name="FILE_JSON" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_FILE:-logs/rag-service.log}</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>logs/rag-service.%d{yyyy-MM-dd}.log</fileNamePattern>
            <maxHistory>7</maxHistory>
        </rollingPolicy>
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <customFields>{"service":"rag-service"}</customFields>
            <fieldNames>
                <timestamp>ts</timestamp>
                <version>[ignore]</version>
                <levelValue>[ignore]</levelValue>
            </fieldNames>
        </encoder>
    </appender>

    <root level="${LOG_LEVEL:-INFO}">
        <appender-ref ref="CONSOLE_JSON"/>
        <appender-ref ref="FILE_JSON"/>
    </root>
</configuration>
```

#### 5.1.2 引入 logstash-logback-encoder 依赖

每个 Java 服务的 `pom.xml` 追加：

```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>8.0</version>
</dependency>
```

**注意**: 这个依赖已经在 Spring Boot 的 managed dependencies 中有版本定义（`spring-boot-dependencies` 不管理它），建议在父 POM 的 `<dependencyManagement>` 中统一声明版本。

#### 5.1.3 MDC 工具类 — `TraceLogHelper`

每个 Java 服务新增 `src/main/java/com/kb/{service}/util/TraceLogHelper.java`：

```java
package com.kb.{service}.util;

import org.slf4j.MDC;

public final class TraceLogHelper {

    private TraceLogHelper() {}

    /** 生成 trace_id 格式: tr-{uuid4} */
    public static String generateTraceId() {
        return "tr-" + java.util.UUID.randomUUID().toString();
    }

    /** 入口处设置 trace_id */
    public static void setTraceId(String traceId) {
        MDC.put("trace_id", traceId);
    }

    /** 设置链路环节 */
    public static void setSpan(String span) {
        MDC.put("span", span);
    }

    /** 设置日志类别 */
    public static void setEventType(String eventType) {
        MDC.put("event_type", eventType);
    }

    /** 请求结束清理 MDC */
    public static void clear() {
        MDC.remove("trace_id");
        MDC.remove("span");
        MDC.remove("event_type");
    }
}
```

**MDC 字段会自动被 LogstashEncoder 序列化到 JSON 输出中**，变成 Loki 可查询的字段。

#### 5.1.4 Filter — 自动注入 access log

每个 Java 服务新增 `src/main/java/com/kb/{service}/config/TraceLogFilter.java`：

```java
package com.kb.{service}.config;

import com.kb.{service}.util.TraceLogHelper;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TraceLogFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(TraceLogFilter.class);

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpReq = (HttpServletRequest) request;
        HttpServletResponse httpResp = (HttpServletResponse) response;

        // 1. 优先从请求头获取上游传入的 trace_id，否则生成新的
        String traceId = httpReq.getHeader("X-Trace-Id");
        if (traceId == null || traceId.isBlank()) {
            traceId = TraceLogHelper.generateTraceId();
        }
        TraceLogHelper.setTraceId(traceId);
        TraceLogHelper.setEventType("access");

        long start = System.currentTimeMillis();
        try {
            // 2. 响应头返回 trace_id（方便前端/客户端提取）
            httpResp.setHeader("X-Trace-Id", traceId);
            chain.doFilter(request, response);
        } finally {
            long duration = System.currentTimeMillis() - start;
            int status = httpResp.getStatus();

            // 3. Access log: 每个 HTTP 请求一条
            MDC.put("duration_ms", String.valueOf(duration));
            MDC.put("method", httpReq.getMethod());
            MDC.put("path", httpReq.getRequestURI());
            MDC.put("status_code", String.valueOf(status));

            if (status >= 500) {
                log.error("HTTP {} {} {} {}ms", status, httpReq.getMethod(),
                        httpReq.getRequestURI(), duration);
            } else if (status >= 400) {
                log.warn("HTTP {} {} {} {}ms", status, httpReq.getMethod(),
                        httpReq.getRequestURI(), duration);
            } else {
                log.info("HTTP {} {} {} {}ms", status, httpReq.getMethod(),
                        httpReq.getRequestURI(), duration);
            }

            TraceLogHelper.clear();
        }
    }
}
```

#### 5.1.5 各服务的特定日志埋点改造

以下是每个服务需要追加的**结构化日志埋点**。埋点方式是：在关键方法入口/出口使用 `MDC.put("span", "xxx")` 标记环节，用 `log.info("...")` 记录业务上下文。

**关键原则**：不新增日志框架，不引入 OpenTelemetry Agent，纯 MDC + SLF4J 代码级埋点。每个服务改动量约 20-50 行。

---

##### 5.1.5.1 ingest-service

| 方法 | span | event_type | 附加字段 |
|------|------|-----------|---------|
| `DocController.createDoc()` 入口 | — | `access` | filter 自动 |
| `MinioService.upload()` | `minio_upload` | `trace` | `doc_id`, `file_size_bytes`, `bucket` |
| `SpaceService.createSpace()` | — | `app` | `space_id`, `tenant_id` |
| 数据库写操作异常 | — | `error` | `error_code`, SQL state |

**目标产出** (一天入库链路可追踪)：

```
[ingest] trace_id=tr-xxx span=minio_upload doc_id=doc-123 file_size_bytes=512000 msg="Uploaded to MinIO"
[ingest] trace_id=tr-xxx span=kafka_produce doc_id=doc-123 topic=file-ingest msg="Published to file-ingest"
```

---

##### 5.1.5.2 kb-doc-processor (Python)

当前问题：Python 标准 `logging` 输出纯文本，没有 trace_id 透传，没有 JSON 格式。

**改造方案**：使用 `python-json-logger` 库（轻量，零依赖除了 stdlib），在 Kafka consumer 入口从消息头提取 `trace_id`。

**新增依赖** (`requirements.txt` 或 `pyproject.toml`)：

```
python-json-logger==3.2.1
```

**新增** `src/logging_config.py`：

```python
import logging
import sys
from pythonjsonlogger import jsonlogger

SERVICE_NAME = "kb-doc-processor"


def setup_logging(level: int = logging.INFO):
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
        json_ensure_ascii=False,
    ))
    # 注入 service 字段到每行日志
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # 补充默认字段
    old_factory = logging.getLogRecordFactory()

    def record_factory(*args, **kwargs):
        record = old_factory(*args, **kwargs)
        record.service = SERVICE_NAME
        if not hasattr(record, "trace_id"):
            record.trace_id = ""
        if not hasattr(record, "event_type"):
            record.event_type = "app"
        if not hasattr(record, "span"):
            record.span = ""
        return record

    logging.setLogRecordFactory(record_factory)
```

**修改** `src/main.py` 的 `logging.basicConfig` → `setup_logging()`。

**修改** `src/kafka_consumer.py`，从消息 header 读取 trace_id，注入到日志上下文：

```python
# 在 poll 循环中
trace_id = ""
for header in record.headers:
    if header[0] == "trace_id":
        trace_id = header[1].decode("utf-8") if header[1] else "tr-" + str(uuid.uuid4())
        break

extra = {"trace_id": trace_id, "event_type": "trace"}
logger.info("Doc processing started", extra=extra)
```

**关键埋点**：

| 环节 | span | 附加字段 |
|------|------|---------|
| Kafka 消息接收 | `kafka_receive` | `topic`, `partition`, `offset` |
| Tika 解析 | `tika_parse` | `doc_id`, `file_type`, `parse_duration_ms` |
| 文本清洗 | `text_clean` | `doc_id`, `original_bytes`, `cleaned_bytes` |
| 切片 (固定/语义/LLM) | `chunk_split` | `doc_id`, `chunker_type`, `chunk_count` |
| 写 `knowledge_clean` | `db_insert_clean` | `doc_id`, `clean_id` |
| 写 `knowledge_structured` | `db_insert_structured` | `doc_id`, `chunk_ids[]` |
| 写 `embed_task` + Kafka 发送 | `kafka_produce` | `topic=embed-task`, `task_count` |
| 解析/切片异常 | `error` | `error_code`, `file_path` |

---

##### 5.1.5.3 vector-service

| 方法 | span | event_type | 附加字段 |
|------|------|-----------|---------|
| `EmbedTaskConsumer` 消费 | `kafka_receive` | `trace` | `topic=embed-task`, `batch_size` |
| `EmbeddingClient.embed()` | `embedding_call` | `trace` | `model`, `batch_size`, `dimension`, `duration_ms` |
| `MilvusService.upsert()` | `milvus_upsert` | `trace` | `collection`, `row_count`, `duration_ms` |
| `SearchIndexWriter` 写索引 | `bm25_index_write` | `app` | `doc_id`, `index_type` |
| Embedding/Milvus 超时/错误 | — | `error` | `error_code`, `retry_count` |

---

##### 5.1.5.4 rag-service

| 方法 | span | event_type | 附加字段 |
|------|------|-----------|---------|
| `ChatController.chat()` 入口 | — | `access` | filter 自动 |
| `QueryRewritingService.rewrite()` | `query_rewrite` | `trace` | `original_query`, `rewritten_query`, `duration_ms` |
| `Bm25SearchService.search()` | `bm25_search` | `trace` | `query`, `result_count`, `duration_ms` |
| `MilvusService.search()` | `vector_search` | `trace` | `collection`, `top_k`, `result_count`, `duration_ms` |
| `RRFFusionService.fuse()` | `rrf_fusion` | `trace` | `bm25_count`, `vector_count`, `fused_count` |
| `AclPostFilter.filter()` | `acl_filter` | `trace` | `pre_count`, `post_count` |
| `RerankClient.rerank()` | `rerank` | `trace` | `input_count`, `output_count`, `duration_ms` |
| `LlmGatewayClient.chat()` | `llm_call` | `trace` | `model`, `prompt_tokens`, `completion_tokens`, `duration_ms` |
| `PipelineTraceService` 各阶段 | `pipeline_summary` | `trace` | `total_ms`, `cache_hit`, `result` |
| 关键词回退触发 | `keyword_fallback` | `app` | `reason` |
| Milvus 超时 | — | `error` | `error_code=MILVUS_TIMEOUT` |

**注意**：rag-service 的 `PipelineTraceService` 已经有一套 `RAG_PIPELINE` 日志体系，本次改造需要让其输出 JSON 格式（通过 logback），并在 `stage()` 方法中自动设置 MDC span，不需要大量改动现有代码。

---

##### 5.1.5.5 rerank-service (Python)

与 kb-doc-processor 相同的 `python-json-logger` 方案。

**关键埋点**：

| 环节 | span | 附加字段 |
|------|------|---------|
| 请求接收 | `rerank_request` | `trace_id`, `query_len`, `doc_count` |
| BGE-Reranker 推理 | `rerank_inference` | `model`, `duration_ms`, `gpu_used` |
| 返回排序结果 | `rerank_response` | `top_k`, `scores[]` (截断) |

---

##### 5.1.5.6 llm-gateway

| 方法 | span | event_type | 附加字段 |
|------|------|-----------|---------|
| `LlmController.chat()` 入口 | — | `access` | filter 自动 |
| 上游 LLM 调用 | `llm_upstream` | `trace` | `provider`, `model`, `prompt_tokens`, `completion_tokens`, `duration_ms` |
| `AuditService.log()` | `llm_audit` | `app` | `tenant_id`, `provider`, `model`, `status`, `error_code` |

**注意**：llm-gateway 已有 `AuditService` 输出 `LLM_AUDIT` 行。改造后统一走 JSON logback，去掉手工拼字符串。

---

##### 5.1.5.7 kb-portal (Next.js 前端)

当前现状：零日志。

**改造方案**：轻量方案 — 不引入 winston/pino 等框架，使用一个 `client-logger.ts` 工具模块，封装 `console.log/error` 为结构化 JSON，并在生产构建中通过 Next.js 的 `instrumentation.ts` 注册全局错误处理器。

**新增** `kb-portal/web/src/lib/client-logger.ts`：

```typescript
type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntry {
  ts: string;
  level: LogLevel;
  service: "kb-portal";
  msg: string;
  trace_id?: string;
  event_type: "app" | "error" | "access";
  path?: string;
  error_code?: string;
  stack_trace?: string;
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case "ERROR": console.error(line); break;
    case "WARN": console.warn(line); break;
    default: console.log(line); break;
  }
  // TODO Phase2: 发送到后端 /api/logs 端点做前端日志采集
}

export const clientLogger = {
  info(msg: string, extra?: Partial<LogEntry>) {
    emit({ ts: new Date().toISOString(), level: "INFO", service: "kb-portal", msg, event_type: "app", ...extra });
  },
  warn(msg: string, extra?: Partial<LogEntry>) {
    emit({ ts: new Date().toISOString(), level: "WARN", service: "kb-portal", msg, event_type: "app", ...extra });
  },
  error(msg: string, extra?: Partial<LogEntry>) {
    emit({ ts: new Date().toISOString(), level: "ERROR", service: "kb-portal", msg, event_type: "error", ...extra });
  },
  access(msg: string, extra?: Partial<LogEntry>) {
    emit({ ts: new Date().toISOString(), level: "INFO", service: "kb-portal", msg, event_type: "access", ...extra });
  },
};
```

**新增** `kb-portal/web/src/instrumentation.ts` (Next.js instrumentation hook)：

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // SSR 端日志采集
    const { clientLogger } = await import("./lib/client-logger");
    process.on("uncaughtException", (err) => {
      clientLogger.error(`Uncaught: ${err.message}`, {
        error_code: "UNCAUGHT_EXCEPTION",
        stack_trace: err.stack?.replace(/\n/g, "\\n"),
      });
    });
    process.on("unhandledRejection", (reason) => {
      clientLogger.error(`Unhandled rejection: ${reason}`, {
        error_code: "UNHANDLED_REJECTION",
      });
    });
  }
}
```

在 `next.config.ts` 中启用 instrumentation：

```ts
experimental: {
  instrumentationHook: true,
}
```

然后在关键路由/API 调用点使用 `clientLogger`：

- `src/api/http-client.ts` — 每个 HTTP 请求记录 access log（status, duration, path, trace_id from response header `X-Trace-Id`）
- `src/app/rag/page.tsx` — 对话请求/响应
- 页面级 `error.tsx` — 渲染错误

**注意**：浏览器端的日志 Promtail 采不到（Promtail 只能读服务端文件/stdout）。所以前端日志分两路：
  1. SSR 端 (Node.js 进程): stdout → Promtail 采集
  2. 浏览器端: 暂存 `console`，未来通过 `/api/logs` 推送到后端再写 stdout

#### 5.1.6 各服务 application.yml 日志配置统一

所有 Java 服务的 `application.yml` 追加：

```yaml
logging:
  level:
    com.kb: ${LOG_LEVEL:INFO}
    org.springframework.web: WARN
    org.apache.kafka.clients.NetworkClient: WARN
  file:
    name: ${LOG_FILE:logs/service-name.log}  # 各服务不同
```

同时在 `application.yml` 中增加 dev profile 覆盖：

```yaml
---
spring:
  config:
    activate:
      on-profile: dev
logging:
  level:
    com.kb: DEBUG
```

---

### 5.7 Docker 容器日志采集 (Infra Log)

当前问题：PostgreSQL、Redis、Kafka、Milvus 等容器的日志也需要采集。

**方案**：在 Promtail 配置中加一个 `docker_sd_configs` 或 `file_sd_configs` 来采集 Docker 容器的 stdout。由于 Docker 日志默认写到 `/var/lib/docker/containers/*/*-json.log`，Promtail 可以直接 tail 这些文件。

详见 [第 6 节 Promtail 配置](#6-promtail-采集配置)。

---

## 6. Promtail 采集配置

### 6.1 安装 Promtail (macOS)

```bash
brew install promtail
```

### 6.2 配置文件

创建 `kb-infra/configs/promtail/promtail-config.yaml`：

```yaml
server:
  http_listen_port: 0          # 不需要 HTTP server
  grpc_listen_port: 0          # 不需要 gRPC server
  log_level: info

clients:
  - url: http://localhost:31008/loki/api/v1/push
    external_labels:
      source: promtail

# --- 采集源 1: 应用服务 .dev.log 文件 ---
scrape_configs:
  - job_name: kb-app-services
    static_configs:
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-mcp/ingest-service/.dev.log
          service: ingest-service
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-mcp/vector-service/.dev.log
          service: vector-service
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-mcp/rag-service/.dev.log
          service: rag-service
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-mcp/llm-gateway/.dev.log
          service: llm-gateway
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-mcp/public-api/.dev.log
          service: public-api
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-doc-processor/.dev.log
          service: kb-doc-processor
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/rerank-service/.dev.log
          service: rerank-service
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-portal/web/.dev.log
          service: kb-portal
    pipeline_stages:
      # 处理 pre-JSON-migration 的纯文本日志行 (兼容期)
      - match:
          selector: '{service=~".+"}'
          stages:
            - regex:
                expression: '^(?P<ts_raw>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\S*)\s+(?P<level_raw>\w+)\s+(?P<msg_raw>.*)$'
            - timestamp:
                source: ts_raw
                format: RFC3339
                fallback_formats:
                  - '2006-01-02 15:04:05.000'
                  - '2006-01-02T15:04:05.000'
            - labels:
                level:
      # JSON 行直接解析 (迁移完成后)
      - match:
          selector: '{service=~".+"}'
          stages:
            - json:
                expressions:
                  ts: ts
                  level: level
                  msg: msg
                  trace_id: trace_id
                  event_type: event_type
                  span: span
                  duration_ms: duration_ms
                  user_id: user_id
                  doc_id: doc_id
                  error_code: error_code
                  status_code: status_code
                  model: model
            - timestamp:
                source: ts
                format: RFC3339
            - labels:
                level:
                event_type:
                span:
            - structured_metadata:
                trace_id:
                user_id:
                doc_id:
                error_code:
                status_code:
                model:

  # --- 采集源 2: Docker 容器日志 (infra) ---
  - job_name: kb-infra-docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 15s
        filters:
          - name: name
            values:
              - kb-postgres
              - kb-redis
              - kb-minio
              - kb-milvus
              - kb-kafka
              - kb-tika
    relabel_configs:
      - source_labels: ["__meta_docker_container_name"]
        regex: "/(.*)"
        target_label: "container"
      - source_labels: ["__meta_docker_container_name"]
        target_label: "service"
        replacement: "${1}"
    pipeline_stages:
      - regex:
          expression: '^(?P<ts_raw>\S+\s+\S+\s+\S+)\s+(?P<msg_raw>.*)$'
      - labels:
          service:
          event_type:  # 默认 infra
      - static_labels:
          event_type: infra
      - structured_metadata:
          container:

  # --- 采集源 3: application.yml 中配置的 file 日志 (兜底) ---
  - job_name: kb-app-file-logs
    static_configs:
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-mcp/vector-service/logs/vector-service.log
          service: vector-service
          source: file-logger
      - targets:
          - localhost
        labels:
          __path__: /Users/apple/project/kb-platform/kb-mcp/public-api/logs/audit.log
          service: public-api
          source: audit-file
```

### 6.3 启动 Promtail

```bash
# 启动 (前台调试)
promtail -config.file=kb-infra/configs/promtail/promtail-config.yaml

# 或通过 start-all.sh 管理（追加 promtail 启动逻辑）
```

### 6.4 在 start-all.sh 中集成 Promtail

```bash
start_promtail() {
  if pgrep -f "promtail.*promtail-config" > /dev/null 2>&1; then
    log_skip "[promtail] 已在运行，跳过"
    return
  fi
  log_info "[promtail] 启动 Promtail..."
  nohup promtail -config.file="$SCRIPT_DIR/kb-infra/configs/promtail/promtail-config.yaml" \
    > "$SCRIPT_DIR/kb-infra/configs/promtail/promtail.log" 2>&1 &
}
```

并在 `check_status()` 中增加 Promtail 检查。

---

## 7. Grafana 仪表盘方案

### 7.1 仪表盘体系

| 仪表盘 | 名称 | 用途 |
|--------|------|------|
| **Overview** | KB Platform 总览 | 所有服务的 ERROR 数量趋势、QPS、P99 延迟 |
| **Link A — RAG 检索链路** | RAG Pipeline | 从 query_rewrite → bm25_search → vector_search → rerank → llm_call 的完整耗时瀑布 |
| **Link B — 文档入库链路** | Doc Ingest Pipeline | 从 upload → tika_parse → chunk_split → embedding → milvus_upsert 的完整追踪 |
| **Audit & Access** | 审计与访问 | Access Log 汇总、按用户/API 聚合、LLM 调用审计 |
| **Errors** | 错误监控 | 按服务/错误码分组，带堆栈摘要 |

### 7.2 Loki LogQL 查询示例

#### 7.2.1 按 trace_id 追踪完整链路 A

```logql
{service=~"rag-service|rerank-service|llm-gateway"} 
  | json 
  | trace_id="tr-abc123..."
  | line_format "{{.span}} {{.duration_ms}}ms {{.msg}}"
```

#### 7.2.2 RAG 链路各环节 P99 耗时

```logql
quantile_over_time(0.99,
  {event_type="trace", span=~"query_rewrite|bm25_search|vector_search|rerank|llm_call"}
  | json
  | unwrap duration_ms
  | __error__=""
  [1h]
) by (span)
```

#### 7.2.3 各服务 ERROR 实时趋势

```logql
sum(count_over_time({level="ERROR"} | json [5m])) by (service)
```

#### 7.2.4 慢查询检测 (RAG > 5s)

```logql
{service="rag-service", event_type="trace", span="pipeline_summary"}
  | json
  | duration_ms > 5000
  | line_format "trace_id={{.trace_id}} duration_ms={{.duration_ms}}"
```

#### 7.2.5 LLM 调用 Token 用量趋势

```logql
avg(
  {service="llm-gateway", span="llm_upstream"}
  | json
  | unwrap prompt_tokens
  [1h]
) by (model)
```

### 7.3 仪表盘 JSON 文件

仪表盘 JSON 文件放置在 `kb-infra/docker-compose/configs/grafana/dashboards/`，Grafana Provisioning 自动加载。

由于文件较大，完整仪表盘 JSON 在此处给出结构模板，完整版本通过 Grafana UI 导出后放入对应目录：

```json
{
  "dashboard": {
    "title": "KB Platform Overview",
    "tags": ["kb-platform"],
    "panels": [
      {
        "title": "ERROR rate by service",
        "type": "barchart",
        "targets": [
          {
            "expr": "sum(count_over_time({level=\"ERROR\"} | json [5m])) by (service)",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "RAG Pipeline Latency by Stage",
        "type": "table",
        "targets": [
          {
            "expr": "avg_over_time({event_type=\"trace\",span=~\"query_rewrite|bm25_search|vector_search|rerank|llm_call\"} | json | unwrap duration_ms | __error__=\"\" [30m]) by (span)",
            "format": "table"
          }
        ]
      },
      {
        "title": "Access Log: QPS",
        "type": "timeseries",
        "targets": [
          {
            "expr": "sum(rate({event_type=\"access\"} | json [1m])) by (service)",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "P99 Latency by Endpoint",
        "type": "table",
        "targets": [
          {
            "expr": "quantile_over_time(0.99, {event_type=\"access\"} | json | unwrap duration_ms | __error__=\"\" [1h]) by (service, path)",
            "format": "table"
          }
        ]
      }
    ]
  }
}
```

**仪表盘放置清单**：

| 文件 | 仪表盘 |
|------|--------|
| `dashboards/kb-overview.json` | KB Platform 总览 |
| `dashboards/kb-rag-pipeline.json` | RAG 检索链路 |
| `dashboards/kb-doc-ingest.json` | 文档入库链路 |
| `dashboards/kb-audit.json` | 审计与访问 |
| `dashboards/kb-errors.json` | 错误监控 |

---

## 8. 实施步骤

### Phase 1 — 基础设施 (0.5 天)

| 步骤 | 内容 | 验证方式 |
|------|------|---------|
| 1.1 | 创建 `kb-infra/docker-compose/configs/loki/loki-config.yaml` | — |
| 1.2 | 创建 `kb-infra/docker-compose/configs/grafana/datasources/loki.yaml` | — |
| 1.3 | 创建 `kb-infra/docker-compose/configs/grafana/dashboards/default.yaml` | — |
| 1.4 | `docker-compose.yml` 追加 loki + grafana 服务 + grafana_data volume | `docker compose up -d loki grafana` |
| 1.5 | 安装 Promtail: `brew install promtail` | `promtail --version` |
| 1.6 | 创建 Promtail 配置文件 | — |
| 1.7 | 启动 Promtail，验证日志能推到 Loki | Grafana Explore 查询 `{service="rag-service"}` |
| 1.8 | MinIO 中创建 `loki-data` bucket (Loki 启动时自动创建，无需手动) | `mc ls local/loki-data` |

### Phase 2 — Java 服务日志标准化 (1 天)

| 步骤 | 内容 | 涉及文件 |
|------|------|---------|
| 2.1 | 父 POM 中统一声明 `logstash-logback-encoder:8.0` 版本 | 父 `pom.xml` |
| 2.2 | 为 5 个 Java 服务各创建 `logback-spring.xml` | 5 × `logback-spring.xml` |
| 2.3 | 为 5 个 Java 服务各新增 `TraceLogHelper.java` | 5 × `TraceLogHelper.java` |
| 2.4 | 为 5 个 Java 服务各新增 `TraceLogFilter.java` | 5 × `TraceLogFilter.java` |
| 2.5 | 更新各服务 `application.yml` 日志配置 | 5 × `application.yml` |

### Phase 3 — 业务埋点 (1 天)

| 步骤 | 内容 |
|------|------|
| 3.1 | ingest-service: MinioService + Kafka 发送点埋点 |
| 3.2 | kb-doc-processor: 引入 python-json-logger + Kafka header trace_id 透传 + 管道各阶段埋点 |
| 3.3 | vector-service: EmbedTaskConsumer + EmbeddingClient + MilvusService 埋点 |
| 3.4 | rag-service: ChatServiceImpl 管道各阶段 MDC span 标记 |
| 3.5 | rerank-service: python-json-logger + BGE-Reranker 推理埋点 |
| 3.6 | llm-gateway: AuditService 改为 JSON 输出 |

### Phase 4 — 前端日志 + 仪表盘 (0.5 天)

| 步骤 | 内容 |
|------|------|
| 4.1 | kb-portal: 创建 `client-logger.ts` + `instrumentation.ts` |
| 4.2 | kb-portal: `http-client.ts` 注入 access log |
| 4.3 | 创建 5 个 Grafana 仪表盘 JSON 文件 |
| 4.4 | `start-all.sh` 集成 promtail 启停 |

### Phase 5 — 验证 (0.5 天)

| 步骤 | 内容 |
|------|------|
| 5.1 | 全链路冒烟测试：上传文档 → 查入库链路日志 → RAG 对话 → 查检索链路日志 |
| 5.2 | 验证 trace_id 全链路透传：从 Portal 到 Milvus |
| 5.3 | 验证 Grafana 仪表盘数据正常 |
| 5.4 | 模拟错误场景，验证 error 日志正确采集 |

**总计：3.5 天**

---

## 9. 运维手册

### 9.1 日常操作

```bash
# 查看日志采集状态
curl http://localhost:31008/ready              # Loki 健康检查

# 检查 Promtail 是否在运行
pgrep -fl promtail

# Grafana 登录
open http://localhost:31009                     # 匿名访问，无需登录

# 在 Grafana Explore 中试查日志
# Data source 选择 "Loki"，输入: {service="rag-service"} | json
```

### 9.2 日志保留策略

| 环境 | 保留天数 | 配置位置 |
|------|---------|---------|
| 开发 (本地) | 30 天 | `loki-config.yaml` → `limits_config.retention_period` |
| 预发布/生产 | 90 天 | 环境变量 `LOKI_RETENTION_DAYS=90` |

### 9.3 故障排查

| 现象 | 排查步骤 |
|------|---------|
| Grafana 查不到日志 | 1. `docker logs kb-loki` 看 Loki 是否正常 2. `curl localhost:31008/ready` 3. 检查 Promtail 是否在运行 |
| Promtail 连不上 Loki | 检查 `promtail-config.yaml` 中 `client.url`，确认 31008 端口 |
| 日志多了 "error" 标签 | 不是真正的 ERROR — 检查日志内容中包含 "error" 字符串的 INFO 行。Loki label `level` 从 JSON 的 `level` 字段提取，不受内容影响。如果出现误标，检查 logback-spring.xml 或 Promtail 的 label 提取正 |
| Loki 占用内存过高 | 调小 `limits_config.max_entries_limit_per_query`，减少查询时间范围 |
| MinIO 中 loki-data 膨胀 | 检查 compactor 是否正常 (`docker logs kb-loki` 中搜索 `compaction`)；降低 `retention_period` |

### 9.4 未来升级路径

| 阶段 | 做什么 |
|------|--------|
| **现在** | Grafana + Loki + Promtail，日志聚合 + 查询 |
| **下季度** | 引入 Prometheus + Spring Boot Actuator Micrometer (rag-service 已有)，加服务指标监控（CPU、内存、GC、QPS、DB 连接池） |
| **半年后** | 引入 Grafana Tempo / OpenTelemetry，将 trace_id 升级为 OTel trace context，全链路分布式追踪 |

---

## 附录 A：新增文件清单

```
kb-infra/
├── docker-compose/
│   ├── docker-compose.yml                        # [修改] 追加 loki + grafana 服务
│   └── configs/
│       ├── loki/
│       │   └── loki-config.yaml                  # [新增]
│       ├── grafana/
│       │   ├── datasources/
│       │   │   └── loki.yaml                     # [新增]
│       │   └── dashboards/
│       │       ├── default.yaml                  # [新增]
│       │       ├── kb-overview.json              # [新增]
│       │       ├── kb-rag-pipeline.json          # [新增]
│       │       ├── kb-doc-ingest.json            # [新增]
│       │       ├── kb-audit.json                 # [新增]
│       │       └── kb-errors.json                # [新增]
│       └── promtail/
│           └── promtail-config.yaml              # [新增]

kb-mcp/
├── ingest-service/src/main/
│   ├── resources/
│   │   └── logback-spring.xml                    # [新增]
│   └── java/com/kb/ingest/
│       ├── util/TraceLogHelper.java              # [新增]
│       └── config/TraceLogFilter.java            # [新增]
├── vector-service/src/main/
│   ├── resources/
│   │   └── logback-spring.xml                    # [新增]
│   └── java/com/kb/vector/
│       ├── util/TraceLogHelper.java              # [新增]
│       └── config/TraceLogFilter.java            # [新增]
├── rag-service/src/main/
│   ├── resources/
│   │   └── logback-spring.xml                    # [新增]
│   └── java/com/kb/rag/
│       ├── util/TraceLogHelper.java              # [新增]
│       └── config/TraceLogFilter.java            # [新增]
├── llm-gateway/src/main/
│   ├── resources/
│   │   └── logback-spring.xml                    # [新增]
│   └── java/com/kb/llm/
│       ├── util/TraceLogHelper.java              # [新增]
│       └── config/TraceLogFilter.java            # [新增]
└── public-api/src/main/
    └── resources/
        └── logback-spring.xml                    # [替换，覆盖现有]

kb-doc-processor/src/
├── logging_config.py                             # [新增]
└── main.py                                       # [修改] basicConfig → setup_logging()

rerank-service/src/
├── logging_config.py                             # [新增]
└── main.py                                       # [修改] basicConfig → setup_logging()

kb-portal/web/src/
├── lib/client-logger.ts                          # [新增]
└── instrumentation.ts                            # [新增]

start-all.sh                                      # [修改] 追加 promtail 启停
```

## 附录 B：新增依赖清单

| 依赖 | 服务 | 用途 |
|------|------|------|
| `net.logstash.logback:logstash-logback-encoder:8.0` | 所有 Java 服务 (5×) | JSON 格式日志输出 |
| `python-json-logger==3.2.1` | kb-doc-processor, rerank-service | Python JSON 日志 |
| `promtail` (via Homebrew) | 宿主机 | 日志采集 agent |
| `grafana/loki:3.2.0` | Docker | 日志存储 |
| `grafana/grafana:11.3.0` | Docker | 可视化 + 仪表盘 |

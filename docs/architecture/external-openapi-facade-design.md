# 企业 AI 知识库对外系统接口方案

> 适用场景：第三方业务系统、审计平台、OA/门户、低代码平台、智能助手等系统间调用  
> 设计目标：对外提供稳定、简单、安全的“文件入库”和“知识问答”能力，同时不影响现有前端和内部服务接口  
> 建议版本：`/openapi/v1`

---

## 1. 背景与结论

当前项目内部已经具备两类能力：

1. 文档入库能力：`ingest-service` 已提供 `init-upload → upload/verify → commit → ingest → status` 等接口。
2. 知识问答能力：`rag-service` 已提供 `/rag/v1/chat` 和 `/rag/v1/chat/stream`。

但这些接口更偏内部工程接口，暴露了较多内部状态机细节。如果直接给外部系统使用，会有几个问题：

- 外部调用方需要理解 `DRAFT/PENDING/PROCESSING/READY` 状态流转。
- 文件上传需要调用多步接口，接入复杂。
- 内部字段如 `tenantId`、`ownerUid`、`permGroupId`、`ACL` 不适合完全交给外部系统自由传入。
- 后续内部入库流程调整时，外部调用方容易被迫跟着改。
- 系统间调用需要更严格的鉴权、幂等、限流、审计和错误码规范。

因此建议新增一层 **Public API Facade**，对外只暴露两个核心业务接口：

| 能力 | 对外接口 | 作用 |
|------|----------|------|
| 文件上传并触发入库 | `POST /openapi/v1/kb/files/ingest` | 外部系统上传文件，平台自动完成元数据登记、文件存储、校验、提交、触发解析与向量入库 |
| 知识问答 | `POST /openapi/v1/kb/chat` | 外部系统发起知识问答，返回答案、引用来源、会话 ID 和 traceId |

另外建议提供两个配套能力，但它们不是新的核心业务能力：

| 配套能力 | 对外接口 | 作用 |
|----------|----------|------|
| 查询入库状态 | `GET /openapi/v1/kb/files/{docId}/status` | 外部系统查询异步入库进度 |
| 入库完成回调 | `callbackUrl` | 外部系统不轮询时，由平台回调通知 `READY/FAILED` |

核心原则：**新增对外接口，不替换、不删除、不改造现有内部接口。**

---

## 2. 总体架构

### 2.1 推荐组件形态

建议新增 `public-api` 服务，或在 `kb-gateway` 中增加 `openapi` 路由层。

```text
外部系统
  → /openapi/v1
  → public-api / kb-gateway-openapi
      → ingest-service
      → rag-service
      → MinIO
      → audit / rate-limit / idempotency
```

推荐优先级：

1. **短期**：在 `kb-gateway` 或单独 `public-api` 中做 HTTP 编排，最快落地。
2. **中期**：沉淀为独立 `public-api` 服务，专门负责外部系统接入、鉴权、审计、限流、幂等。
3. **长期**：对外接口纳入 API 网关管理，支持开发者应用、密钥、配额、回调签名和调用统计。

### 2.2 不影响现有功能的实现方式

对外接口只做编排，不改变现有业务服务职责。

| 现有能力 | 保持不变 | 对外 Facade 的处理 |
|----------|----------|-------------------|
| 前端上传流程 | 继续使用现有 `/kb/v1/docs/*` | Facade 内部复用 `DocService` 或调用现有接口 |
| 文档解析流程 | 继续由 Kafka + `kb-doc-processor` 处理 | Facade 只负责触发，不直接解析文件 |
| 向量入库流程 | 继续由 `vector-service` 写 Milvus | Facade 不直接写 Milvus |
| RAG 问答 | 继续由 `rag-service` 编排 | Facade 做参数适配、权限上下文注入、结果裁剪 |
| 前端 RAG 页面 | 继续使用 `/rag/v1/chat` | 外部系统使用 `/openapi/v1/kb/chat` |

### 2.3 内部编排关系

#### 文件入库接口内部编排

```text
POST /openapi/v1/kb/files/ingest
  → 校验 client token / scope / tenant / space 权限
  → 校验文件大小、类型、hash、幂等键
  → 调用 ingest-service initUpload
  → 将文件写入 MinIO
  → 调用 ingest-service verifyUpload
  → 调用 ingest-service commit
  → 调用 ingest-service ingest
  → 返回 202 Accepted
  → 后台由 Kafka → doc-processor → vector-service → Milvus 完成入库
```

#### 知识问答接口内部编排

```text
POST /openapi/v1/kb/chat
  → 校验 client token / scope / tenant / space 权限
  → 从 client 绑定关系解析 tenantId、userContext、permGroupIds
  → 参数适配为 rag-service ChatRequest
  → 调用 rag-service /rag/v1/chat 或 /rag/v1/chat/stream
  → 过滤或裁剪内部字段
  → 返回 answer + citations + sessionId + traceId
```

---

## 3. 鉴权与系统间调用规范

### 3.1 认证方式

系统间调用建议采用 **OAuth2 Client Credentials**，不建议外部系统直接传 `userId`、`tenantId` 并由后端信任。

```http
Authorization: Bearer <access_token>
```

Token 推荐 claims：

| Claim | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `iss` | string | 是 | 令牌签发方 |
| `aud` | string | 是 | 固定为 `mcp-kb-openapi` 或 `mcp-kb` |
| `client_id` | string | 是 | 外部系统应用 ID |
| `tenant_id` | string | 是 | 绑定租户，不允许请求体覆盖 |
| `scope` | string/list | 是 | 权限范围 |
| `space_ids` | string/list | 否 | 允许访问的知识空间范围 |
| `sec_level` | integer | 否 | 系统最高可访问密级 |
| `perm_group_ids` | array | 否 | 权限组 ID 列表 |
| `exp` | integer | 是 | 过期时间 |

### 3.2 Scope 设计

| Scope | 允许操作 |
|-------|----------|
| `kb:file:write` | 上传文件并触发入库 |
| `kb:file:read` | 查询文件入库状态 |
| `kb:chat:query` | 发起知识问答 |
| `kb:chat:stream` | 发起流式知识问答 |

### 3.3 公共请求头

所有对外接口统一支持以下 Header：

| Header | 必填 | 说明 |
|--------|------|------|
| `Authorization` | 是 | `Bearer <access_token>` |
| `X-Request-Id` | 否 | 外部系统请求 ID；未传则平台生成 |
| `X-Client-Id` | 否 | 外部系统应用 ID；通常从 token 中解析，不建议信任 Header |
| `Idempotency-Key` | 上传接口必填 | 幂等键，避免重试导致重复入库 |
| `Content-Type` | 是 | 上传接口为 `multipart/form-data`，问答接口为 `application/json` |

### 3.4 租户与用户上下文

系统间调用分两类：

| 类型 | 说明 | 权限上下文来源 |
|------|------|----------------|
| 应用级调用 | 外部系统代表自身调用，如批量入库、系统机器人问答 | `client_id` 绑定的 `tenant_id/sec_level/perm_group_ids/space_ids` |
| 代表用户调用 | 外部系统代表某个登录用户问答 | 建议走 OBO Token，令牌中携带真实用户上下文 |

第一阶段可以先支持应用级调用；代表用户调用作为增强能力。

---

## 4. 接口一：上传文件并触发入库

### 4.1 基本信息

| 项 | 内容 |
|----|------|
| 接口名称 | 上传文件并触发知识入库 |
| URL | `POST /openapi/v1/kb/files/ingest` |
| Content-Type | `multipart/form-data` |
| 认证 | `Bearer Token` |
| 必需 Scope | `kb:file:write` |
| 幂等 | 必须传 `Idempotency-Key` |
| 处理模式 | 默认异步，返回 `202 Accepted` |

### 4.2 为什么必须异步

文件解析、清洗、切片、embedding、Milvus upsert 是异步流水线。同步等待到 `READY` 会带来以下风险：

- 大文件或队列积压时容易 HTTP 超时。
- 外部系统重试可能产生重复任务。
- 解析失败原因需要异步落库和审计。

因此本接口语义定义为：**接收文件并成功触发入库任务**，不承诺响应返回时已经可检索。

如外部系统必须知道最终状态，有两种方式：

1. 传 `callbackUrl`，平台完成后回调。
2. 调用 `GET /openapi/v1/kb/files/{docId}/status` 轮询。

### 4.3 Request Headers

| 字段 | 类型 | 必填 | 示例 | 说明 |
|------|------|------|------|------|
| `Authorization` | string | 是 | `Bearer eyJ...` | 系统间访问令牌 |
| `Idempotency-Key` | string | 是 | `erp-20260510-000001` | 幂等键。同一 client 下重复提交返回同一任务结果 |
| `X-Request-Id` | string | 否 | `req-20260510-001` | 外部请求追踪 ID |

### 4.4 Request Body

`multipart/form-data`

| 字段 | 类型 | 必填 | 默认值 | 示例 | 说明 |
|------|------|------|--------|------|------|
| `file` | binary | 是 | - | `采购管理办法.pdf` | 文件内容 |
| `filename` | string | 否 | 原始文件名 | `采购管理办法.pdf` | 指定文件名；不传则取 multipart 文件名 |
| `fileHash` | string | 否 | 服务端计算 | `64位sha256` | 文件 SHA256；传入后服务端会校验 |
| `spaceId` | string | 否 | client 默认空间 | `audit-policy` | 目标知识空间 ID |
| `docType` | string | 否 | `OTHER` | `POLICY` | 文档类型 |
| `bizDomain` | string | 否 | client 默认业务域 | `AUDIT` | 业务域 |
| `regionCode` | string | 否 | `CN-NATIONAL` | `CN-NATIONAL` | 地域码 |
| `secLevel` | integer | 否 | client 默认密级 | `3` | 文档密级，不能超过 client 可写密级 |
| `effectiveFrom` | string/date | 否 | 空 | `2026-05-10` | 生效日期 |
| `effectiveTo` | string/date | 否 | 空 | `2027-05-10` | 失效日期，空表示长期有效 |
| `tags` | string | 否 | 空 | `审计,制度,采购` | 文档标签，逗号分隔 |
| `chunkMode` | string | 否 | 空间默认 | `SMART` | 分块模式 |
| `chunkSize` | integer | 否 | 空间默认 | `512` | 分块字符数，建议 100-2000 |
| `overlapRatio` | integer | 否 | 空间默认 | `10` | 重叠比例，0-50 |
| `ownerUid` | string | 否 | client 默认用户 | `system-erp` | 业务归属用户，不作为鉴权依据 |
| `deptId` | string | 否 | client 默认部门 | `D001` | 业务归属部门 |
| `acl` | string/json | 否 | client 默认 ACL | 见下方 | 文档访问 ACL，JSON 字符串 |
| `callbackUrl` | string | 否 | 空 | `https://erp.example.com/kb/callback` | 入库完成回调地址 |
| `callbackSecretId` | string | 否 | 空 | `erp-prod-secret` | 回调签名密钥 ID |
| `metadata` | string/json | 否 | 空 | `{...}` | 外部业务元数据，平台只透传审计 |

`docType` 建议枚举：

| 值 | 说明 |
|----|------|
| `REGULATION` | 法规/制度 |
| `POLICY` | 政策/规范 |
| `AUDIT` | 审计资料 |
| `MANUAL` | 操作手册 |
| `CONTRACT` | 合同/协议 |
| `OTHER` | 其他 |

`chunkMode` 建议枚举：

| 值 | 说明 |
|----|------|
| `HEAD_FIRST` | 从前往后固定切分 |
| `TAIL_FIRST` | 从后往前固定切分 |
| `UNIFORM` | 均匀切分 |
| `SMART` | 规则语义切片，支持 Parent-Child |
| `SMART_LLM` | LLM 精修边界，失败回退规则切片 |

`acl` 示例：

```json
[
  {
    "accessorType": "DEPT",
    "accessorId": "AUDIT_DEPT",
    "permission": "READ"
  },
  {
    "accessorType": "ROLE",
    "accessorId": "AUDIT_MANAGER",
    "permission": "READ"
  }
]
```

ACL 字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `accessorType` | string | 是 | `USER`、`ROLE`、`DEPT` |
| `accessorId` | string | 是 | 用户 ID、角色编码或部门 ID |
| `permission` | string | 是 | `READ`、`WRITE`、`ADMIN`；外部入库通常只允许 `READ` |

### 4.5 请求示例

```bash
curl -X POST "https://kb.example.com/openapi/v1/kb/files/ingest" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: erp-file-20260510-0001" \
  -H "X-Request-Id: req-erp-0001" \
  -F "file=@采购管理办法.pdf" \
  -F "spaceId=audit-policy" \
  -F "docType=POLICY" \
  -F "bizDomain=AUDIT" \
  -F "regionCode=CN-NATIONAL" \
  -F "secLevel=3" \
  -F "tags=审计,制度,采购" \
  -F "chunkMode=SMART" \
  -F "callbackUrl=https://erp.example.com/api/kb/callback"
```

### 4.6 成功响应

HTTP Status：`202 Accepted`

```json
{
  "success": true,
  "code": "ACCEPTED",
  "message": "文件已接收，入库任务已触发",
  "traceId": "tr-2b45d4f0-7a1c-4cc5-9199-3f26fbf60b80",
  "requestId": "req-erp-0001",
  "data": {
    "docId": "DOC-20260510-000001",
    "version": 1,
    "jobId": "JOB-20260510-000001",
    "status": "PROCESSING",
    "filename": "采购管理办法.pdf",
    "fileHash": "5f70bf18a086007016b27a975c563d1d28a7c5e6b5a8e4f9f0b6c0d6b6e2d8d1",
    "spaceId": "audit-policy",
    "submittedAt": "2026-05-10T18:30:00+08:00",
    "statusUrl": "/openapi/v1/kb/files/DOC-20260510-000001/status",
    "estimatedReadySeconds": 300
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否成功接收请求 |
| `code` | string | 业务码，成功为 `ACCEPTED` |
| `message` | string | 可读说明 |
| `traceId` | string | 平台全链路追踪 ID |
| `requestId` | string | 外部请求 ID，来自 `X-Request-Id` 或平台生成 |
| `data.docId` | string | 平台文档 ID |
| `data.version` | integer | 文档版本 |
| `data.jobId` | string | 本次入库任务 ID |
| `data.status` | string | 当前状态，通常为 `PROCESSING` |
| `data.filename` | string | 文件名 |
| `data.fileHash` | string | SHA256 |
| `data.spaceId` | string | 知识空间 ID |
| `data.submittedAt` | string | 任务提交时间 |
| `data.statusUrl` | string | 查询状态的 URL |
| `data.estimatedReadySeconds` | integer | 预计可检索时间，非 SLA 承诺 |

### 4.7 幂等响应

同一个 `client_id + Idempotency-Key` 重复提交时，如果原任务已存在，返回同一个结果。

HTTP Status：`200 OK`

```json
{
  "success": true,
  "code": "IDEMPOTENT_REPLAY",
  "message": "检测到重复请求，返回已存在的入库任务",
  "traceId": "tr-xxx",
  "requestId": "req-erp-0001",
  "data": {
    "docId": "DOC-20260510-000001",
    "version": 1,
    "jobId": "JOB-20260510-000001",
    "status": "PROCESSING",
    "statusUrl": "/openapi/v1/kb/files/DOC-20260510-000001/status"
  }
}
```

### 4.8 失败响应

统一错误结构：

```json
{
  "success": false,
  "code": "FILE_TOO_LARGE",
  "message": "文件大小超过限制，当前限制为 50MB",
  "traceId": "tr-xxx",
  "requestId": "req-erp-0001",
  "details": {
    "maxSizeBytes": 52428800,
    "actualSizeBytes": 73400320
  }
}
```

常见错误码：

| HTTP | code | 说明 |
|------|------|------|
| 400 | `INVALID_ARGUMENT` | 参数格式错误 |
| 400 | `UNSUPPORTED_FILE_TYPE` | 文件类型不支持 |
| 400 | `FILE_TOO_LARGE` | 文件大小超过限制 |
| 400 | `HASH_MISMATCH` | 传入 hash 与服务端计算不一致 |
| 401 | `UNAUTHORIZED` | token 缺失、过期或无效 |
| 403 | `FORBIDDEN` | scope 不足或无空间写权限 |
| 409 | `DUPLICATE_FILE` | 相同 hash 文件已存在且未允许复用 |
| 409 | `IDEMPOTENCY_CONFLICT` | 同一个幂等键对应不同文件或参数 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体过大 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type 不支持 |
| 429 | `RATE_LIMITED` | 超过调用频率或并发入库限制 |
| 500 | `INTERNAL_ERROR` | 平台内部错误 |
| 503 | `PIPELINE_UNAVAILABLE` | Kafka、MinIO、Milvus 等关键依赖不可用 |

---

## 5. 配套接口：查询文件入库状态

虽然核心业务接口只有两个，但异步入库必须提供状态查询能力，否则外部系统无法判断文件是否已经可检索。

### 5.1 基本信息

| 项 | 内容 |
|----|------|
| URL | `GET /openapi/v1/kb/files/{docId}/status` |
| 认证 | `Bearer Token` |
| 必需 Scope | `kb:file:read` |

### 5.2 Path 参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `docId` | string | 是 | 文档 ID |

### 5.3 Query 参数

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `version` | integer | 否 | `1` | 文档版本 |
| `includeStages` | boolean | 否 | `false` | 是否返回阶段明细 |

### 5.4 成功响应

```json
{
  "success": true,
  "code": "OK",
  "message": "查询成功",
  "traceId": "tr-xxx",
  "data": {
    "docId": "DOC-20260510-000001",
    "version": 1,
    "status": "READY",
    "ready": true,
    "filename": "采购管理办法.pdf",
    "spaceId": "audit-policy",
    "submittedAt": "2026-05-10T18:30:00+08:00",
    "updatedAt": "2026-05-10T18:33:21+08:00",
    "retryCount": 0,
    "lastError": null,
    "stages": [
      {
        "name": "PARSE",
        "status": "DONE",
        "startedAt": "2026-05-10T18:30:05+08:00",
        "finishedAt": "2026-05-10T18:30:35+08:00",
        "message": "Tika 解析完成"
      },
      {
        "name": "VECTOR_UPSERT",
        "status": "DONE",
        "startedAt": "2026-05-10T18:32:10+08:00",
        "finishedAt": "2026-05-10T18:33:21+08:00",
        "message": "Milvus upsert 完成"
      }
    ]
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.status` | string | 文档状态 |
| `data.ready` | boolean | 是否已可检索 |
| `data.retryCount` | integer | 重试次数 |
| `data.lastError` | string/null | 最后错误信息 |
| `data.stages[].name` | string | 阶段名 |
| `data.stages[].status` | string | `PENDING/PROCESSING/DONE/FAILED` |

状态枚举：

| 状态 | 说明 | 是否可检索 |
|------|------|------------|
| `DRAFT` | 已登记但未提交 | 否 |
| `PENDING` | 已提交，等待触发或排队 | 否 |
| `PROCESSING` | 正在解析/向量化/入库 | 否 |
| `READY` | 入库完成 | 是 |
| `FAILED` | 入库失败 | 否 |
| `DEPRECATED` | 已废弃 | 否 |
| `OFFBOARDED` | 旧版本下线 | 否 |

---

## 6. 配套能力：入库完成回调

### 6.1 回调触发时机

当文档状态进入以下终态时触发：

- `READY`
- `FAILED`
- `DEPRECATED`，可选

### 6.2 回调请求

```http
POST {callbackUrl}
Content-Type: application/json
X-KB-Signature: sha256=<signature>
X-KB-Timestamp: 1778409180000
X-KB-Trace-Id: tr-xxx
```

请求体：

```json
{
  "eventType": "FILE_INGEST_READY",
  "eventId": "evt-20260510-000001",
  "traceId": "tr-xxx",
  "occurredAt": "2026-05-10T18:33:21+08:00",
  "data": {
    "docId": "DOC-20260510-000001",
    "version": 1,
    "jobId": "JOB-20260510-000001",
    "status": "READY",
    "ready": true,
    "filename": "采购管理办法.pdf",
    "spaceId": "audit-policy",
    "lastError": null
  }
}
```

### 6.3 签名规则

建议签名原文：

```text
timestamp + "." + rawBody
```

签名算法：

```text
HMAC-SHA256(secret, signingPayload)
```

外部系统返回 `2xx` 表示接收成功；非 `2xx` 平台按指数退避重试，建议最多重试 5 次。

---

## 7. 接口二：知识问答

### 7.1 基本信息

| 项 | 内容 |
|----|------|
| 接口名称 | 知识问答 |
| URL | `POST /openapi/v1/kb/chat` |
| Content-Type | `application/json` |
| 认证 | `Bearer Token` |
| 必需 Scope | `kb:chat:query` |
| 默认模式 | 非流式 JSON 响应 |

### 7.2 Request Headers

| 字段 | 类型 | 必填 | 示例 | 说明 |
|------|------|------|------|------|
| `Authorization` | string | 是 | `Bearer eyJ...` | 系统间访问令牌 |
| `X-Request-Id` | string | 否 | `req-chat-001` | 外部请求追踪 ID |
| `Idempotency-Key` | string | 否 | `chat-req-001` | 可选。用于外部重试时避免重复扣费或重复写会话 |

### 7.3 Request Body

```json
{
  "query": "采购合同审批流程是什么？",
  "spaceId": "audit-policy",
  "sessionId": "sess-20260510-000001",
  "lang": "zh",
  "topK": 20,
  "stream": false,
  "returnCitationText": true,
  "metadata": {
    "sourceSystem": "erp",
    "businessNo": "PO-20260510-001"
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | 是 | - | 用户问题，建议 2-1000 字符 |
| `spaceId` | string | 否 | client 默认空间或全库 | 限定知识空间；必须在 client 授权空间内 |
| `sessionId` | string | 否 | 空 | 会话 ID；传入则支持多轮上下文 |
| `lang` | string | 否 | `zh` | 语言，`zh/en` |
| `topK` | integer | 否 | `20` | 召回数量建议值，平台可按策略上限裁剪 |
| `stream` | boolean | 否 | `false` | 是否流式返回 |
| `returnCitationText` | boolean | 否 | `true` | 是否返回引用片段全文；部分场景可关闭以降低响应体大小 |
| `returnTrace` | boolean | 否 | `false` | 是否返回简化 trace 摘要；默认只返回 traceId |
| `metadata` | object | 否 | 空 | 外部业务元数据，仅用于审计和排查 |

### 7.4 非流式成功响应

HTTP Status：`200 OK`

```json
{
  "success": true,
  "code": "OK",
  "message": "回答生成成功",
  "traceId": "tr-9f4e49a5-ec18-4d6d-8322-f33c9cf8a2b7",
  "requestId": "req-chat-001",
  "data": {
    "answer": "采购合同审批通常需要先提交采购申请，再经过部门负责人、财务或合规审核，最后由授权审批人确认。具体流程以《采购管理办法》第三章为准。[1]",
    "sessionId": "sess-20260510-000001",
    "refused": false,
    "reason": null,
    "citations": [
      {
        "index": 1,
        "docId": "DOC-20260510-000001",
        "title": "采购管理办法.pdf",
        "version": 1,
        "chunkSeq": 12,
        "page": 3,
        "sectionPath": "第三章 / 合同审批",
        "spaceId": "audit-policy",
        "spacePath": "审计制度库 / 采购制度",
        "score": 0.86,
        "isCurrent": true,
        "effectiveFrom": "2026-01-01",
        "effectiveTo": null,
        "text": "采购合同应按照采购申请、部门审核、财务审核、授权审批的流程执行……"
      }
    ],
    "usage": {
      "promptTokens": 4200,
      "completionTokens": 380,
      "totalTokens": 4580
    }
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 请求是否成功 |
| `code` | string | 业务码 |
| `message` | string | 可读说明 |
| `traceId` | string | 平台全链路追踪 ID |
| `requestId` | string | 外部请求 ID |
| `data.answer` | string | 答案文本 |
| `data.sessionId` | string | 会话 ID |
| `data.refused` | boolean | 是否拒答 |
| `data.reason` | string/null | 拒答原因 |
| `data.citations` | array | 引用来源 |
| `data.usage` | object/null | Token 用量；取决于 LLM gateway 是否返回 |

Citation 字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `index` | integer | 引用序号，对应答案中的 `[1]` |
| `docId` | string | 文档 ID |
| `title` | string | 文档标题 |
| `version` | integer | 文档版本 |
| `chunkSeq` | integer | 命中的 chunk 序号 |
| `page` | integer | 页码 |
| `sectionPath` | string | 章节路径 |
| `spaceId` | string | 知识空间 ID |
| `spacePath` | string | 知识空间路径 |
| `score` | number | 相关性分数 |
| `isCurrent` | boolean | 是否当前有效版本 |
| `effectiveFrom` | string/null | 生效日期 |
| `effectiveTo` | string/null | 失效日期 |
| `text` | string/null | 引用片段文本；当 `returnCitationText=false` 时为空 |

### 7.5 拒答响应

业务拒答仍返回 `200 OK`，因为请求成功处理，只是知识库不支持回答。

```json
{
  "success": true,
  "code": "REFUSED",
  "message": "知识库未能提供可用答案",
  "traceId": "tr-xxx",
  "requestId": "req-chat-001",
  "data": {
    "answer": "知识库中暂时没有找到相关资料。",
    "sessionId": "sess-20260510-000001",
    "refused": true,
    "reason": "NO_MATCH",
    "citations": []
  }
}
```

拒答原因：

| reason | 说明 |
|--------|------|
| `NO_MATCH` | 没有召回相关内容 |
| `NO_PERMISSION` | 有相关内容，但当前系统或用户无权访问 |
| `LOW_CONFIDENCE` | 召回内容相关性过低 |
| `OUT_OF_SCOPE` | 问题超出知识库支持范围，可作为后续增强 |

### 7.6 流式响应

如果 `stream=true`，同一个接口可返回 SSE。

请求：

```json
{
  "query": "采购合同审批流程是什么？",
  "spaceId": "audit-policy",
  "stream": true
}
```

响应 Header：

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

事件格式：

```text
event: token
data: {"token":"采购"}

event: token
data: {"token":"合同审批通常需要"}

event: done
data: {"traceId":"tr-xxx","sessionId":"sess-xxx","citations":[...]}
```

事件说明：

| event | 说明 |
|-------|------|
| `token` | 增量文本 |
| `citation` | 可选，提前返回引用 |
| `done` | 结束事件，返回完整元数据 |
| `error` | 错误事件 |

如果要降低第一阶段复杂度，可以先只开放非流式；流式作为第二阶段能力。

### 7.7 失败响应

系统错误返回非 2xx。

```json
{
  "success": false,
  "code": "RAG_SERVICE_UNAVAILABLE",
  "message": "知识问答服务暂不可用，请稍后重试",
  "traceId": "tr-xxx",
  "requestId": "req-chat-001",
  "details": {
    "dependency": "rag-service"
  }
}
```

常见错误码：

| HTTP | code | 说明 |
|------|------|------|
| 400 | `INVALID_ARGUMENT` | 参数错误 |
| 401 | `UNAUTHORIZED` | token 无效 |
| 403 | `FORBIDDEN` | scope 不足或无空间访问权限 |
| 404 | `SPACE_NOT_FOUND` | 知识空间不存在或不可访问 |
| 408 | `REQUEST_TIMEOUT` | 问答超时 |
| 409 | `IDEMPOTENCY_CONFLICT` | 幂等键冲突 |
| 429 | `RATE_LIMITED` | 超过频率限制 |
| 500 | `INTERNAL_ERROR` | 平台内部错误 |
| 503 | `RAG_SERVICE_UNAVAILABLE` | RAG 服务不可用 |
| 503 | `LLM_GATEWAY_UNAVAILABLE` | LLM 网关不可用 |
| 503 | `VECTOR_STORE_UNAVAILABLE` | Milvus 或 embedding 服务不可用 |

---

## 8. 对外接口与内部接口映射

### 8.1 文件入库映射

| 对外字段/动作 | 内部映射 |
|---------------|----------|
| `file` | Facade 写入 MinIO，或调用 `DocController.uploadFile` |
| `filename` | `InitUploadRequest.filename` |
| `fileHash` | `InitUploadRequest.fileHash`，未传时 Facade 计算 |
| `spaceId` | `InitUploadRequest.knowledgeSpaceId` |
| `docType` | `InitUploadRequest.docType` |
| `bizDomain` | `InitUploadRequest.bizDomain` |
| `regionCode` | `InitUploadRequest.regionCode` |
| `secLevel` | `InitUploadRequest.secLevel` |
| `tags` | `InitUploadRequest.labelTags` |
| `chunkMode/chunkSize/overlapRatio` | `InitUploadRequest.chunkConfig` |
| `acl` | `CommitRequest.acl` |
| 触发入库 | `DocService.ingest` |
| 状态查询 | `DocService.getStatus` |

### 8.2 问答映射

| 对外字段 | 内部映射 |
|----------|----------|
| `query` | `ChatRequest.query` |
| `spaceId` | `ChatRequest.spaceId` |
| `sessionId` | `ChatRequest.sessionId` |
| `lang` | `ChatRequest.lang` |
| `topK` | `ChatRequest.topK` |
| `tenantId` | 从 token 解析后填入 `ChatRequest.tenantId` |
| `answer` | `ChatResponse.answer` |
| `citations` | `ChatResponse.citations`，对外裁剪字段 |
| `traceId` | `ChatResponse.traceId` |
| `reason` | `ChatResponse.reason` |

---

## 9. 幂等、限流与审计

### 9.1 幂等规则

文件上传接口必须支持幂等：

```text
idempotency_key_unique = client_id + Idempotency-Key
```

建议保存：

| 字段 | 说明 |
|------|------|
| `client_id` | 外部系统 ID |
| `idempotency_key` | 幂等键 |
| `request_hash` | 请求参数摘要，不含文件原文 |
| `file_hash` | 文件 SHA256 |
| `doc_id` | 生成的文档 ID |
| `job_id` | 入库任务 ID |
| `status` | 当前状态 |
| `response_snapshot` | 首次响应快照 |
| `expire_at` | 幂等记录过期时间，建议 24-72 小时 |

同一幂等键但文件或关键参数不同，返回 `409 IDEMPOTENCY_CONFLICT`。

### 9.2 限流建议

| 维度 | 建议 |
|------|------|
| 文件上传 QPS | 按 client 配置，如 1-5 QPS |
| 并发入库任务 | 按 client 配置，如 5-20 个 |
| 单文件大小 | 第一阶段建议 50MB；如沿用 MVP 可设 5MB |
| 单日文件数 | 按租户/系统设置配额 |
| 问答 QPS | 按 client 配置，如 5-20 QPS |
| 问答并发 | 按 client 配置，如 20-100 |
| 流式连接数 | 单独限制，避免占满线程 |

### 9.3 审计日志

建议对外接口统一记录：

| 字段 | 说明 |
|------|------|
| `trace_id` | 平台追踪 ID |
| `request_id` | 外部请求 ID |
| `client_id` | 外部系统 |
| `tenant_id` | 租户 |
| `api_path` | 接口路径 |
| `method` | HTTP 方法 |
| `scope` | 授权范围 |
| `space_id` | 知识空间 |
| `doc_id` | 文档 ID，文件接口有 |
| `session_id` | 会话 ID，问答接口有 |
| `status_code` | HTTP 状态码 |
| `biz_code` | 业务码 |
| `latency_ms` | 耗时 |
| `error_message` | 错误信息 |
| `created_at` | 调用时间 |

---

## 10. 安全设计

### 10.1 不信任外部传入租户

外部请求体不建议允许传 `tenantId`。即使传入，也只能用于校验，实际租户必须来自 token 或 client 配置。

### 10.2 不信任外部传入用户权限

以下字段不应由外部系统自由决定：

- `tenantId`
- `permGroupIds`
- `userSecLevel`
- `spaceIds`
- `role`

它们应由 token claims、client 配置或 OBO token 解析得到。

### 10.3 文件安全

建议增加：

- 文件类型白名单。
- 文件大小限制。
- 文件 hash 校验。
- MIME sniffing，不能只信任扩展名。
- 病毒扫描接口预留。
- 压缩包炸弹防护，如果未来支持压缩包。
- 扫描件/OCR 开关按租户配置。

### 10.4 回调安全

回调必须签名：

- 使用 HMAC-SHA256。
- 带 timestamp，防重放。
- 外部系统按 `eventId` 去重。
- 回调 URL 必须在 client 配置中预登记，避免 SSRF。

---

## 11. 兼容性与版本策略

### 11.1 URL 版本

所有外部接口带版本：

```text
/openapi/v1/...
```

### 11.2 兼容原则

兼容变更：

- 新增可选字段。
- 新增枚举值，但需要提前公告。
- 响应新增字段。

不兼容变更：

- 删除字段。
- 修改字段类型。
- 修改必填规则。
- 修改状态语义。

不兼容变更必须发布 `/openapi/v2`。

### 11.3 字段命名

建议对外统一使用 `lowerCamelCase`，与当前 Java DTO 风格一致。

---

## 12. 落地计划

### 12.1 第一阶段：最小可用对外接口

目标：不影响现有功能，快速提供系统间调用能力。

范围：

- 新增 `POST /openapi/v1/kb/files/ingest`
- 新增 `GET /openapi/v1/kb/files/{docId}/status`
- 新增 `POST /openapi/v1/kb/chat`
- 接入 client token 校验或临时 API Key
- 支持幂等键
- 支持基础审计日志
- 非流式问答优先

内部实现：

- 复用 `DocService`、`MinioService`、`ChatService`。
- 不改现有 `/kb/v1/docs/*` 和 `/rag/v1/*`。

### 12.2 第二阶段：增强系统接入体验

范围：

- 支持入库完成回调。
- 支持流式问答。
- 支持调用配额和按 client 限流。
- 支持回调签名。
- 支持更细阶段状态。
- 接入 API 网关调用统计。

### 12.3 第三阶段：生产级治理

范围：

- OAuth2 Client Credentials 正式接入。
- OBO 代表用户调用。
- client/tenant/space 权限配置后台。
- 审计报表、成本统计、SLO 监控。
- Badcase 反馈闭环。

---

## 13. 建议最终接口清单

### 核心对外接口

| 方法 | URL | 说明 |
|------|-----|------|
| `POST` | `/openapi/v1/kb/files/ingest` | 上传文件并触发解析、切片、向量入库 |
| `POST` | `/openapi/v1/kb/chat` | 知识问答 |

### 必要配套接口

| 方法 | URL | 说明 |
|------|-----|------|
| `GET` | `/openapi/v1/kb/files/{docId}/status` | 查询异步入库状态 |
| `POST` | `{callbackUrl}` | 入库完成回调，由外部系统提供 URL |

---

## 14. 总结

本方案的核心不是再复制两套业务逻辑，而是在现有系统之上增加一层稳定的 **对外 API 契约层**。

这样做有四个好处：

1. **外部系统接入简单**：只需要理解“上传入库”和“知识问答”两个业务动作。
2. **内部系统不受影响**：现有前端、内部接口、Kafka 流程、RAG 流程保持不变。
3. **未来演进空间充足**：OCR、BM25、Rerank、权限打通、评测闭环等内部升级不影响外部契约。
4. **满足系统间调用要求**：鉴权、幂等、限流、审计、回调、安全边界都能统一治理。


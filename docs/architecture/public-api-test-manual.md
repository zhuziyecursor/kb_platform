# Public API 测试用例手册

> 服务地址: `http://localhost:31006`  
> 认证方式: `Authorization: Bearer pk-dev-0000000000000001`  
> 所有请求需携带此 Header，否则返回 401。

---

## 1. 上传文件并触发入库

**POST** `/openapi/v1/kb/files/ingest`

Content-Type: `multipart/form-data`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | binary | 是 | 文件内容，≤50MB |
| `filename` | string | 否 | 文件名，不传则取原始文件名 |
| `docType` | string | 否 | 文档类型：REGULATION/POLICY/AUDIT/MANUAL/CONTRACT/OTHER |
| `bizDomain` | string | 否 | 业务域 |
| `spaceId` | string | 否 | 知识空间 ID |
| `tags` | string | 否 | 标签，逗号分隔 |
| `acl` | string(JSON) | 否 | 文档 ACL，JSON 数组字符串 |

### 请求头

| Header | 必填 | 说明 |
|--------|------|------|
| `Authorization` | 是 | `Bearer pk-dev-0000000000000001` |
| `Idempotency-Key` | 否 | 幂等键，重复提交返回相同结果 |

---

### 正案例

#### 用例 1.1：上传 PDF 文件

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/files/ingest" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Idempotency-Key: test-upload-001" \
  -F "file=@/path/to/采购管理办法.pdf" \
  -F "docType=POLICY" \
  -F "bizDomain=AUDIT" \
  -F "tags=审计,制度,采购"
```

**预期响应 (202 Accepted):**
```json
{
  "docId": "DOC-xxxxxxxxxxxxxxxx",
  "version": 1,
  "jobId": "DOC-xxxxxxxxxxxxxxxx",
  "status": "PROCESSING",
  "message": "入库任务已提交",
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "statusUrl": "/openapi/v1/kb/files/DOC-xxxxxxxxxxxxxxxx/status"
}
```

#### 用例 1.2：上传 Markdown 文件

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/files/ingest" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -F "file=@/path/to/操作手册.md" \
  -F "docType=MANUAL" \
  -F "bizDomain=IT" \
  -F "spaceId=DEFAULT"
```

**预期响应 (202 Accepted):**
```json
{
  "docId": "DOC-xxxxxxxxxxxxxxxx",
  "version": 1,
  "jobId": "DOC-xxxxxxxxxxxxxxxx",
  "status": "PROCESSING",
  "message": "入库任务已提交",
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "statusUrl": "/openapi/v1/kb/files/DOC-xxxxxxxxxxxxxxxx/status"
}
```

#### 用例 1.3：带自定义 ACL

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/files/ingest" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -F "file=@/path/to/审计报告.pdf" \
  -F "docType=AUDIT" \
  -F 'acl=[{"accessorType":"DEPT","accessorId":"AUDIT_DEPT","permission":"READ"},{"accessorType":"ROLE","accessorId":"MANAGER","permission":"READ"}]'
```

**预期响应 (202 Accepted):** 同用例 1.1。

#### 用例 1.4：幂等重放

```bash
# 使用与用例 1.1 相同的 Idempotency-Key 再次调用
curl -X POST "http://localhost:31006/openapi/v1/kb/files/ingest" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Idempotency-Key: test-upload-001" \
  -F "file=@/path/to/采购管理办法.pdf" \
  -F "docType=POLICY"
```

**预期响应 (200 OK):** 返回与首次请求相同的 docId/status（幂等命中）。

---

### 反案例

#### 用例 1.5：缺少 API Key

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/files/ingest" \
  -F "file=@/path/to/test.pdf"
```

**预期响应 (401 Unauthorized):**
```json
{
  "code": "UNAUTHORIZED",
  "message": "Missing or invalid API key",
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### 用例 1.6：错误的 API Key

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/files/ingest" \
  -H "Authorization: Bearer pk-invalid-key-xxxxx" \
  -F "file=@/path/to/test.pdf"
```

**预期响应 (401 Unauthorized):**
```json
{
  "code": "UNAUTHORIZED",
  "message": "Invalid API key",
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### 用例 1.7：文件超过 50MB

```bash
# 准备一个 >50MB 的文件
dd if=/dev/zero of=/tmp/large_file.bin bs=1M count=51

curl -X POST "http://localhost:31006/openapi/v1/kb/files/ingest" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -F "file=@/tmp/large_file.bin"
```

**预期响应 (400 Bad Request):**
```json
{
  "code": "FILE_TOO_LARGE",
  "message": "文件大小超过限制，最大 50MB",
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### 用例 1.8：不传 file 参数

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/files/ingest" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -F "docType=POLICY"
```

**预期响应 (400 Bad Request):** Spring 返回 `MissingServletRequestPartException`，由 GlobalExceptionHandler 包装为内部错误。

---

## 2. 查询文件入库状态

**GET** `/openapi/v1/kb/files/{docId}/status`

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `docId` | string | 是 | 上传接口返回的文档 ID |

---

### 正案例

#### 用例 2.1：查询处理中的文档

```bash
curl -X GET "http://localhost:31006/openapi/v1/kb/files/DOC-xxxxxxxxxxxxxxxx/status" \
  -H "Authorization: Bearer pk-dev-0000000000000001"
```

**预期响应 (200 OK):**
```json
{
  "docId": "DOC-xxxxxxxxxxxxxxxx",
  "version": 1,
  "status": "PROCESSING",
  "retryCount": 0,
  "lastError": null,
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

状态可能的值：`DRAFT` / `PENDING` / `PROCESSING` / `READY` / `FAILED`

#### 用例 2.2：查询已就绪的文档

```bash
curl -X GET "http://localhost:31006/openapi/v1/kb/files/DOC-yyyyyyyyyyyyyyyy/status" \
  -H "Authorization: Bearer pk-dev-0000000000000001"
```

**预期响应 (200 OK):**
```json
{
  "docId": "DOC-yyyyyyyyyyyyyyyy",
  "version": 1,
  "status": "READY",
  "retryCount": 0,
  "lastError": null,
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

---

### 反案例

#### 用例 2.3：缺少 API Key

```bash
curl -X GET "http://localhost:31006/openapi/v1/kb/files/DOC-xxxxxxxxxxxxxxxx/status"
```

**预期响应 (401 Unauthorized):** 同用例 1.5。

#### 用例 2.4：docId 不存在

```bash
curl -X GET "http://localhost:31006/openapi/v1/kb/files/DOC-NONEXIST/status" \
  -H "Authorization: Bearer pk-dev-0000000000000001"
```

**预期响应 (502 Bad Gateway):**
```json
{
  "code": "UPSTREAM_ERROR",
  "message": "上游服务返回错误",
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

---

## 3. 知识问答

**POST** `/openapi/v1/kb/chat`

Content-Type: `application/json`

### 请求体参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | 是 | - | 问题文本，2-1000 字符 |
| `sessionId` | string | 否 | - | 会话 ID，传入则支持多轮对话 |
| `spaceId` | string | 否 | - | 限定知识空间 |
| `topK` | integer | 否 | 20 | 召回数量 |
| `lang` | string | 否 | zh | 语言：zh/en |
| `biz` | string | 否 | - | 业务线 |

> 注意：**不需要传 `tenantId`**，由 API Key 自动注入。

---

### 正案例

#### 用例 3.1：单轮问答

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "采购合同审批流程是什么？"
  }'
```

**预期响应 (200 OK):**
```json
{
  "answer": "采购合同审批通常需要先提交采购申请...",
  "citations": [
    {
      "index": 1,
      "docId": "DOC-xxxxxxxxxxxxxxxx",
      "title": "采购管理办法.pdf",
      "version": 1,
      "chunkSeq": 12,
      "page": 3,
      "sectionPath": "第三章 / 合同审批",
      "spaceId": "DEFAULT",
      "spacePath": null,
      "score": 0.86,
      "isCurrent": true,
      "effectiveFrom": "2026-01-01",
      "effectiveTo": null,
      "text": "采购合同应按照采购申请、部门审核、财务审核..."
    }
  ],
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "reason": null,
  "sessionId": "s-xxxxxxxxxxxxxxxx",
  "confidence": "HIGH"
}
```

#### 用例 3.2：限定知识空间问答

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "员工加班调休规定",
    "spaceId": "HR_POLICY"
  }'
```

**预期响应 (200 OK):** 结构同用例 3.1，citations 均为 HR_POLICY 空间下的文档。

#### 用例 3.3：多轮对话

```bash
# 第一轮
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "采购管理办法的主要内容是什么？"
  }'

# 从第一轮响应中取 sessionId，用于第二轮
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "它的审批流程有哪些步骤？",
    "sessionId": "s-xxxxxxxxxxxxxxxx"
  }'
```

**预期响应 (200 OK):** 第二轮回答能结合上下文理解"它"指代"采购管理办法"。

---

### 反案例

#### 用例 3.4：缺少 query

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "spaceId": "DEFAULT"
  }'
```

**预期响应 (400 Bad Request):**
```json
{
  "code": "VALIDATION_ERROR",
  "message": "query: must not be blank",
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### 用例 3.5：query 为空字符串

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "query": ""
  }'
```

**预期响应 (400 Bad Request):** 同用例 3.4。

#### 用例 3.6：缺少 API Key

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "什么是采购管理办法？"
  }'
```

**预期响应 (401 Unauthorized):** 同用例 1.5。

#### 用例 3.7：RAG 服务不可用（上游断连）

```bash
# 假设 rag-service 未启动
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "测试连接失败"
  }'
```

**预期响应 (502 Bad Gateway):**
```json
{
  "code": "UPSTREAM_UNAVAILABLE",
  "message": "上游服务连接失败",
  "traceId": "tr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### 用例 3.8：传入了 tenantId（验证不会被信任）

```bash
curl -X POST "http://localhost:31006/openapi/v1/kb/chat" \
  -H "Authorization: Bearer pk-dev-0000000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "尝试覆盖租户",
    "tenantId": "evil-tenant-999"
  }'
```

**预期响应 (200 OK):** 请求正常处理，但实际使用的 tenantId 来自 API Key（`dev-tenant-001`），而非请求体中的值。请求体中多余的 `tenantId` 字段被忽略。

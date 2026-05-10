# kb-portal 前端开发规则

## 本地开发

**端口：** `3105`
**启动命令：** `cd kb-portal/web && npm run dev`
**访问地址：** `http://localhost:3105`

---

## 服务职责

知识库管理门户：文档上传管理 + 状态查看 + 知识问答界面。

**所有请求必须经过 kb-gateway，禁止直连任何后端微服务。**

---

## 允许调用的接口白名单

所有请求 BASE_URL 必须指向 kb-gateway（`process.env.REACT_APP_GATEWAY_URL`）：

| 功能 | 方法 | 路径 | 说明 |
|-----|------|-----|------|
| 初始化上传 | POST | `/kb/v1/docs/init-upload` | 获取 docId + presigned URL |
| 验证上传 | POST | `/kb/v1/docs/{docId}/verify-upload` | 直传完成后校验 |
| 提交入库 | POST | `/kb/v1/docs/{docId}/commit` | 附带 sha256 + ACL |
| 触发入库 | POST | `/kb/v1/docs/{docId}/ingest` | - |
| 查询状态 | GET | `/kb/v1/docs/{docId}/status` | 轮询 |
| 知识问答 | POST | `/rag/v1/chat` | - |

**唯一的非 gateway 操作：** MinIO presigned URL 直传（PUT 请求到 presignedUrl）。
presignedUrl 必须来自 `init-upload` 响应，前端**不允许自行构造** MinIO URL。

---

## 绝对禁止

| 禁止的行为 | 原因 |
|-----------|------|
| `localStorage` 存储 token | 安全风险，用 `sessionStorage` |
| 代码中出现 `postgresql://` / `jdbc:` | 前端不允许直连数据库 |
| 代码中出现 Milvus 直连地址（`:19530`） | 前端不允许直连 Milvus |
| 硬编码微服务端口（`:8081`~`:8085`等） | 只允许使用 gateway 地址 |
| 注入 `X-User-Id`、`X-Tenant-Id` 等自定义头 | 只允许 `Authorization: Bearer {oboToken}` |
| 自行构造 MinIO 上传 URL | presignedUrl 必须来自后端 |

---

## HTTP Client 规范

使用统一封装的 `httpClient`（`src/api/http-client.ts`），禁止在业务代码中直接使用原生 `fetch` / `axios` 调用后端接口：

```typescript
// 请求拦截：注入 OBO token，禁止注入自定义用户头
httpClient.interceptors.request.use((config) => {
  const oboToken = sessionStorage.getItem('obo_token');
  if (oboToken) config.headers['Authorization'] = `Bearer ${oboToken}`;
  // 确保没有自定义用户头
  ['x-user-id', 'x-tenant-id', 'x-roles', 'x-dept-id'].forEach(h => delete config.headers[h]);
  return config;
});
```

---

## 文件上传规范（前端双重校验）

```
支持格式：pdf, doc, docx, ppt, pptx, xls, xlsx, txt, md
文件大小：≤ 5MB（提示："文件大小不能超过5MB"）
扫描件：一期不支持（提示："暂不支持扫描件，请上传文字型文档"）
```

---

## 状态展示规范

| status 值 | 展示文字 |
|----------|---------|
| `PENDING` | "等待处理中..." |
| `PROCESSING` | "正在解析文档..." |
| `READY` | "文档已上线，5分钟内可被搜索" |
| `FAILED` | "处理失败 [查看日志]" |

**轮询策略：**
- 提交后立即轮询 `/kb/v1/docs/{docId}/status`
- 间隔：2s（前 30s）→ 5s（30s~120s）→ 30s（2 分钟后）
- 超时：10 分钟后显示"处理超时，请联系管理员"

---

## 安全测试（前端必须包含）

`src/tests/security/forbidden-patterns.test.ts` 中验证：
- 源码中不含 `postgresql://` / `jdbc:` 字符串
- 源码中不含 Milvus 端口 `:19530`
- 源码中不含 `localStorage.*token`（不允许 localStorage 存 token）
- 源码中不含硬编码的微服务端口


## Frontend Development Rules
- 本项目使用 React 18 + antd v5。绝不使用静态 `Modal.confirm`——它在 React 18 中已经失效。始终使用 `App.useApp()` hook 来处理上下文 Modal。
- 不要将 Modal.confirm 嵌套在 Dropdown 菜单中；这会阻止 Modal 正常渲染。
- 处理文件上传时，始终保留 UploadFile 对象上的 `originFileObj` 属性。
- 前端开发服务器运行在 3105 端口。前端变更后，使用项目的启动脚本重启。
- 在声明完成之前，始终验证页面能否在其预期的路由上正常渲染。
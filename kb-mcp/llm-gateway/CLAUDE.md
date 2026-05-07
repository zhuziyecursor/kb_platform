# llm-gateway 开发规则

## 服务职责

LLM 统一网关，接收 chat completion 请求 → 路由到 MiniMax → 返回响应 + 审计日志。

MVP 一期仅支持 MiniMax abab6.5s-chat，接口兼容 OpenAI chat completions 格式。

**不拥有数据库表，不做模型训练，不缓存响应。**

## 接口清单（MVP 一期）

| 接口 | 方法 | 路径 |
|-----|------|------|
| Chat Completion | POST | `/llm/v1/chat/completions` |

请求格式：
```json
{
  "model": "abab6.5s-chat",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.3,
  "maxTokens": 2048
}
```

## 审计日志

每次 LLM 调用必须输出结构化日志：
```
LLM_AUDIT traceId={} tenantId={} provider={} model={} status={}
         promptTokens={} completionTokens={} latencyMs={} errorCode={}
```

PHASE2: 写 kb_audit.llm_call_log 表。

## PHASE2 占位

| 功能 | 占位方式 |
|-----|---------|
| 多模型路由 | `// PHASE2: Multi-model routing` |
| RateLimit | `// PHASE2: Token bucket rate limiter` |
| 审计日志入库 | `// PHASE2: Write to kb_audit.llm_call_log` |
| 流式响应 (SSE) | `// PHASE2: Streaming response support` |

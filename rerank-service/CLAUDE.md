# rerank-service 开发规则

## 服务职责

BGE-Reranker 精排 HTTP 服务。接收 `{query, documents}` → 返回精排 Top5 结果。

**只做精排，不存储数据，不参与消息队列。**

## 本服务无数据库

rerank-service 是无状态计算服务，不拥有任何数据库表，不连接 PostgreSQL。

## 禁止的操作

- 禁止导入 `pymilvus`（不访问向量数据库，import 守护测试会检测）
- 禁止访问 PostgreSQL / MinIO / Kafka
- 禁止直接调用 embedding-service / llm-gateway

## 接口清单（MVP 一期）

| 接口 | 方法 | 路径 |
|-----|------|------|
| 精排 | POST | `/rerank/v1/rerank` |

请求：
```json
{
  "query": "采购合同审批流程",
  "documents": [
    {"text": "..."},
    {"text": "..."}
  ]
}
```

响应：
```json
{
  "results": [
    {"index": 0, "score": 0.95},
    {"index": 3, "score": 0.82}
  ],
  "traceId": "tr-xxx"
}
```

## 模型配置

- 模型：`BAAI/bge-reranker-v2-m3`
- 框架：`sentence-transformers`
- 首次启动自动从 HuggingFace 下载模型（~2GB）
- PHASE2: 支持多模型路由

## Import 守护测试

`tests/test_import_guard.py` 中验证以下库不被导入：
- `pymilvus`

# 服务清单

## 前端

| 服务 | 职责 | 端口 |
|-----|------|------|
| kb-portal | 知识库管理门户，文档上传/列表/问答界面 | 3105 |

## Java 微服务 (kb-mcp)

| 服务 | 职责 | 端口 |
|-----|------|------|
| kb-gateway | 网关，JWT 校验、路由、trace_id 生成 | - |
| auth-adapter | OIDC 登录、OBO Token Exchange | - |
| user-service | 用户上下文、perm_group_id 聚合、user-cud 消费 | - |
| ingest-service | init-upload、commit、ingest、status 接口 | - |
| vector-service | embed-task 消费、BGE 向量化、Milvus upsert | - |
| rag-service | RAG 问答、Milvus 检索、LLM 生成、citations | - |

## Python 工程 (kb-doc-processor)

| 服务 | 职责 | 端口 |
|-----|------|------|
| kb-doc-processor | Kafka Consumer，TikaParser、TextCleaner、FixedLengthChunker | - |

## 基础设施 (kb-infra)

| 服务 | 职责 | 端口 |
|-----|------|------|
| PostgreSQL | 关系型数据库（knowledge_doc、doc_acl 等） | 5432 |
| Redis | 缓存、用户上下文缓存 | 6379 |
| MinIO | S3 兼容对象存储，原始文件存储 | 9000 |
| Kafka | 消息队列（file-ingest、embed-task） | 9092 |
| Milvus | 向量数据库 | 19530 |

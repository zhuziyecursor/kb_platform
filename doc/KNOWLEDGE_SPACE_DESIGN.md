# 知识空间 (Knowledge Space) 优化方案

## 背景

参考 Coze 平台设计，优化 kb-platform 的知识库功能。当前缺少"知识库"一级实体，文档只能上传没有组织方式，切片配置也固定不可调。

## 核心新概念：知识空间

**定位**：轻量级知识库实体，组织文档的容器

**属性**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 主键 |
| name | string | 空间名称 |
| description | string | 描述 |
| chunkSize | int | 段长度 100-2000 |
| overlapRatio | int | 重叠率 0-50% |
| chunkMode | enum | HEAD_FIRST/TAIL_FIRST/UNIFORM |
| visibility | enum | PUBLIC/TEAM |
| docCount | int | 文档数量（计算字段） |

**关系**：一个空间可包含多个文档，不选则进入"DEFAULT"默认空间

---

## 实现文件清单

### 前端 (kb-portal/web)

| 操作 | 文件路径 |
|------|---------|
| 修改 | `src/types/index.ts` - 新增 KnowledgeSpace, ChunkConfig 类型 |
| 新增 | `src/api/knowledge-space.ts` - 空间 API 封装 |
| 修改 | `src/app/documents/upload/page.tsx` - 添加空间选择+切片配置 UI |
| 修改 | `src/app/documents/list/page.tsx` - 添加 Tab 切换+空间筛选 |
| 新增 | `src/app/spaces/list/page.tsx` - 空间列表页 |
| 新增 | `src/app/spaces/create/page.tsx` - 创建空间表单 |
| 新增 | `src/app/spaces/[id]/page.tsx` - 空间详情/编辑 |

### 后端 (kb-mcp/ingest-service)

| 操作 | 文件 |
|------|------|
| 新增 | `knowledge_space` 表 |
| 修改 | `knowledge_doc` 表 - 添加 `knowledge_space_id` 列 |
| 新增 | SpaceController - CRUD API |
| 修改 | InitUploadRequest - 支持 `knowledgeSpaceId` + `chunkConfig` |

### 契约 (contracts/)

| 文件 | 变更 |
|------|------|
| `openapi/ingest-service-v1.yaml` | 新增 KnowledgeSpace Schema |
| `kafka-schemas/file-ingest-message.json` | 新增 `knowledgeSpaceId` + `chunkConfig` 字段 |

### Processor (kb-doc-processor)

| 文件 | 变更 |
|------|------|
| `config/settings.yaml` | chunker 支持 chunk_mode 参数 |
| `chunker.py` | FixedLengthChunker 支持三种模式 |

---

## 前端 UI 变更详情

### 上传页面新增切片配置区块

```
┌─────────────────────────────────────────────────────────┐
│ 知识空间        [选择空间 ▼]                              │
├─────────────────────────────────────────────────────────┤
│ 切片规则        ○ 继承知识空间配置  ● 自定义              │
├─────────────────────────────────────────────────────────┤
│ [当自定义时显示]                                          │
│ 段长度          100 ────●──────── 2000 字符              │
│ 重叠率          0 ────●────────── 50%                   │
│ 切片模式        [从前从后 ▼]                              │
│                 从前从后 | 从后到前 | 均匀切分            │
├─────────────────────────────────────────────────────────┤
│ 覆盖重名文档    [  ]                                     │
└─────────────────────────────────────────────────────────┘
```

### 文档列表页新增 Tab

```
┌─────────────────────────────────────────────────────────┐
│ 文档管理                                    [筛选 ▼]     │
├─────────────────────────────────────────────────────────┤
│ [全部] [合规文档] [人事制度] [操作手册] [+新建空间]       │
│  128     45        38        45                         │
├─────────────────────────────────────────────────────────┤
│  文档列表...                                            │
└─────────────────────────────────────────────────────────┘
```

---

## 实现顺序

1. **数据库** - 新增 `knowledge_space` 表，修改 `knowledge_doc` 表
2. **后端 API** - 空间 CRUD + init-upload 支持新参数
3. **契约更新** - OpenAPI + Kafka Schema
4. **前端类型** - KnowledgeSpace, ChunkConfig 类型
5. **前端 API** - knowledge-space.ts
6. **上传页面** - 空间选择 + 切片配置 UI
7. **列表页面** - Tab 切换 + 空间筛选
8. **空间管理页** - 空间 CRUD 页面
9. **Processor** - 支持动态 chunkConfig

---

## 验证方式

1. 启动前端 `npm run dev`，访问 `/documents/upload` 验证上传表单
2. 创建知识空间，验证 `/spaces` 列表
3. 上传文档选择不同切片配置，验证处理流程
4. 查看文档列表 Tab 切换是否正常

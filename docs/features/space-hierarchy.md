# 知识空间层级化改造设计方案

## 背景

当前知识空间为单层平铺结构，无法满足企业多层级文档分类需求。参考 `知识数据管理.md` 的大纲结构，最深可达 4 层（H2 → H3 → H4 → 文件），需要将知识空间改造为树形层级结构，并在页面上以 Tree 形式展示。

**目标结构示例：**

```
知识数据管理
├── 审计问题定性库
│   ├── 战略规划与执行
│   │   ├── 国家政策
│   │   │   ├── 违规调度运作大额资金（文件）
│   │   │   └── 重要人事、薪酬运作（文件）
│   │   └── 集团战略（文件）
│   └── 财务管理
├── 法律法规库
│   ├── 国家级
│   └── 企业级
│       └── 各业务领域工作规范
└── 审计案例库
    ├── 案例评优（文件）
    └── 实施方案（文件）
```

---

## 设计决策

| 问题 | 决策 | 理由 |
|------|------|------|
| 数据结构 | 自引用树（Adjacency List）+ 物化路径 | 不引入新表，改动最小，子树查询高效 |
| 任意节点能否放文件 | 是 | 不强制只有叶节点才能上传，业务更灵活 |
| 层级深度限制 | 代码层限制最大 10 层 | 防止误操作，业务实际 4 层以内 |
| 分片配置继承 | 子节点可独立配置，不自动继承 | 不改变现有逻辑，降低改动范围 |
| 旧数据兼容 | 现有空间 `parent_id = NULL`，视为根节点 | 零感知迁移，无需数据修复脚本 |
| 是否拆独立 category 表 | 否，直接扩展 knowledge_space | 概念一致，复杂度低 |

---

## 改动范围

### 1. 数据库迁移

新建 `kb-infra/init-db/updates/008_space_hierarchy.sql`，在 `knowledge_space` 表新增三个字段：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `parent_id` | VARCHAR(64) NULL | NULL | 父节点 ID，NULL 表示根节点 |
| `node_path` | TEXT NOT NULL | `'/'` | 物化路径，如 `/root_id/child_id/`，支持子树前缀查询 |
| `depth` | INT NOT NULL | `0` | 层级深度，根节点为 0 |

**新增索引：**

```sql
CREATE INDEX idx_space_parent ON kb_knowledge.knowledge_space(tenant_id, parent_id);
CREATE INDEX idx_space_path   ON kb_knowledge.knowledge_space(tenant_id, node_path);
```

---

### 2. 后端 ingest-service（5 个文件）

#### `KnowledgeSpace.java`
新增三个字段：`parentId`、`nodePath`、`depth`。

#### `CreateSpaceRequest.java`
新增可选字段 `parentId`（不传则为根节点）。

#### `SpaceResponse.java`
新增 `parentId`、`depth` 字段；新增树形版本 `SpaceTreeNode`，包含 `children: List<SpaceTreeNode>`。

#### `KnowledgeSpaceRepository.java`
新增查询方法：
- `findByTenantIdAndParentId` — 查直接子节点
- `findByTenantIdAndNodePathStartingWith` — 查整棵子树
- 子树文档数聚合查询（用于删除前校验）

#### `SpaceServiceImpl.java` + `SpaceController.java`

**新增接口：**

```
GET /kb/v1/spaces/tree  →  返回完整嵌套树结构
```

**创建逻辑变更：**
- 校验 `parentId` 对应的空间存在且属于同一租户
- 计算 `depth = parent.depth + 1`，若 `depth > 9` 则拒绝（限制 10 层）
- 生成 `nodePath = parent.nodePath + newId + '/'`

**删除逻辑变更（级联检查）：**

```sql
-- 查整棵子树（含自身）的文档总数
SELECT COUNT(*) FROM kb_knowledge.knowledge_doc
WHERE knowledge_space_id IN (
  SELECT id FROM kb_knowledge.knowledge_space
  WHERE (node_path LIKE :pathPrefix OR id = :spaceId)
    AND tenant_id = :tenantId
) AND status != 'DEPRECATED'
```

- 总数 > 0：拒绝删除，返回友好提示，说明哪些子空间内有文件
- 总数 = 0：级联删除整棵子树（DELETE WHERE node_path LIKE prefix OR id = spaceId）

---

### 3. API 契约

修改 `contracts/openapi/ingest-service-v1.yaml`：

- `KnowledgeSpace` schema 增加 `parentId`、`depth`、`nodePath` 字段
- 新增 `KnowledgeSpaceTreeNode` schema（含 `children` 数组）
- 新增端点 `GET /spaces/tree`
- `CreateSpaceRequest` schema 增加可选 `parentId`

---

### 4. 前端（3 个文件修改 + 1 个新增）

#### `types/index.ts`
```typescript
export interface KnowledgeSpace {
  // ... 现有字段
  parentId?: string;
  depth: number;
  nodePath: string;
}

export interface KnowledgeSpaceTreeNode extends KnowledgeSpace {
  children: KnowledgeSpaceTreeNode[];
}
```

#### `api/knowledge-space.ts`
新增 `getSpaceTree(): Promise<KnowledgeSpaceTreeNode[]>`。

#### 新增 `components/SpaceTreeView.tsx`
递归树形组件，功能：
- 展开 / 折叠子节点
- 每节点显示：名称、文档数、层级缩进
- 每节点操作按钮：新建子分类、上传文件、编辑、删除
- 删除时若子树有文件，展示包含文件的子空间列表作为错误提示

#### `app/spaces/list/page.tsx`
- 保留顶部统计卡片
- 将文档列表表格替换为 `SpaceTreeView` 树形组件
- 保留创建根节点入口

**树形 UI 效果预览：**

```
▼ 审计问题定性库                              [+子分类] [上传] [编辑] [删除]
  ▼ 战略规划与执行              3 个文档       [+子分类] [上传] [编辑] [删除]
    ▶ 国家政策                  3 个文档
    集团战略                    1 个文档
  ▶ 财务管理                    0 个文档
▼ 法律法规库                                  [+子分类] [上传] [编辑] [删除]
  ▶ 国家级                      5 个文档
  ▼ 企业级
    ▶ 各业务领域工作规范         2 个文档
▶ 审计案例库                    4 个文档
```

---

## 不在本次范围

- 文件 / 节点拖拽排序（依赖 Milvus 原子更新，风险较高，留 Phase 2）
- 跨空间文件移动（同上）
- 从 Markdown 大纲文件批量导入层级结构（Phase 2）
- 空间级别 ACL 权限控制（Phase 2）

---

## 开发顺序

1. 数据库迁移脚本
2. 后端 Java 实体 / DTO / Repository
3. 后端 Service / Controller 逻辑
4. API 契约更新
5. 前端 types / api
6. 前端 SpaceTreeView 组件
7. 前端 list 页面替换

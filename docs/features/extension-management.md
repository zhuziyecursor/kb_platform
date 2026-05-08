# 扩展管理功能设计方案

## 1. 需求概述

在侧边栏新增「扩展管理」功能，用于集中维护以下四类配置：

| 模块 | 说明 |
|------|------|
| 提示词管理 | 系统提示词模板的创建、编辑、版本管理 |
| 外部 Skills | 第三方 external skill 的注册与配置 |
| 自定义 Skills | 用户自己开发的 skill 实现 |
| MCP Servers | MCP server 连接配置（stdio / http 模式） |

**存储方式**: 前端 localStorage + JSON 文件导入导出（与现有 LLM 模型配置一致）

**权限控制**: 仅管理员可编辑，普通用户仅可查看

## 2. 技术方案

### 2.1 侧边栏导航

**修改文件**: `kb-portal/web/src/components/AppLayout.tsx`

在 `NAV_ITEMS` 中新增入口：

```typescript
{ key: 'extensions', icon: <AppstoreOutlined />, label: '扩展管理', path: '/extensions' }
```

### 2.2 页面路由

**新建文件**: `kb-portal/web/src/app/extensions/page.tsx`

采用 `antd Tabs` 实现四个子模块的切换，每个 Tab 复用 settings 页面的 Card + Table + Modal 布局模式。

### 2.3 数据层 Hook

**新建文件**: `kb-portal/web/src/hooks/useExtensions.ts`

参考 `useLLMModels` 的设计模式：

- `localStorage` 持久化
- `useState` + `useEffect` 初始化时从 localStorage 读取
- 对外暴露 `add` / `update` / `remove` / `export` / `import` 方法
- 四类数据使用独立的 Storage Key

### 2.4 数据结构

#### 提示词配置

```typescript
interface PromptConfig {
  id: string;
  name: string;
  description: string;
  content: string;        // 提示词模板内容，支持变量占位，如 {{name}}, {{date}}
  variables: string[];     // 变量列表
  type: 'rag' | 'general';  // 用途类型：RAG 问答 / 通用场景
  isDefault: boolean;      // 是否为默认提示词
  createdAt: string;
  updatedAt: string;
}
```

**用途说明**:
- `type=rag`: 作为 RAG 知识问答的系统提示词模板
- `type=general`: 通用场景的系统提示词
- 用户可设置默认提示词，问答时优先使用默认模板

#### 外部 Skill

```typescript
interface ExternalSkill {
  id: string;
  name: string;
  description: string;
  endpoint: string;        // HTTP 调用地址
  authType: 'none' | 'api_key' | 'bearer';
  metadata: Record<string, string>;  // 额外配置
}
```

#### 自定义 Skill

```typescript
interface CustomSkill {
  id: string;
  name: string;
  description: string;
  type: 'http' | 'script' | 'function';  // 调用类型
  sourceType: 'local';                   // 来源类型（本地文件）
  filePath: string;                      // 本地文件路径
  parameters: SkillParameter[];
  enabled: boolean;
}
```

**来源说明**:
- `sourceType=local`: 从本地文件系统加载 skill 实现
- `filePath`: 指向项目内的 skill 脚本文件
- 用户通过上传或指定路径方式添加本地 skill 文件

#### MCP Server

```typescript
interface MCPServer {
  id: string;
  name: string;
  type: 'stdio' | 'http';   // 连接模式
  command: string;          // 启动命令，如 npx
  args: string[];           // 启动参数
  env: Record<string, string>;  // 环境变量
  enabled: boolean;
  lastTestAt?: string;      // 上次测试时间
  lastTestResult?: 'success' | 'failed';  // 上次测试结果
}
```

**连接测试功能**:
- 用户可对已配置的 MCP Server 发起连接测试
- 测试结果（成功/失败）记录到 `lastTestAt` 和 `lastTestResult`
- 列表中显示最近一次测试状态（图标指示）

## 7. 细节补充

### SkillParameter 定义

```typescript
interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  defaultValue?: string;
}
```

### 页面 Tab 布局

| Tab | 功能 | 关键字段 |
|-----|------|---------|
| 提示词管理 | CRUD + 默认设置 | name, description, type, content, variables, isDefault |
| 外部 Skills | HTTP skill 注册 | name, description, endpoint, authType |
| 自定义 Skills | 本地 skill 管理 | name, description, type, filePath, enabled |
| MCP Servers | 连接配置 + 测试 | name, type, command, args, env, lastTestResult |

## 3. 页面布局

```
┌─────────────────────────────────────────────────────────┐
│ [icon] 扩展管理                                          │
├─────────────────────────────────────────────────────────┤
│ [提示词] [外部 Skills] [自定义 Skills] [MCP Servers]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ 提示词列表 ─────────────────────────────────────┐  │
│  │ 名称    │ 描述        │ 变量数 │ 操作  │        │  │
│  │ Prompt1 │ 用于问答...  │ 2      │ 编辑删除│       │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  [导入] [导出] [+ 添加提示词]                           │
│                                                         │
│  ⚠️ 配置保存在浏览器本地存储中，支持导入/导出 JSON 备份  │
└─────────────────────────────────────────────────────────┘
```

## 4. 文件清单

| 操作 | 文件路径 |
|------|---------|
| 修改 | `kb-portal/web/src/components/AppLayout.tsx` |
| 新建 | `kb-portal/web/src/app/extensions/page.tsx` |
| 新建 | `kb-portal/web/src/hooks/useExtensions.ts` |

## 5. 复用设计

- **UI 模式**: 复用 `settings/page.tsx` 的 Card + Table + Modal 布局
- **数据持久化**: 复用 `useLLMModels` 的 localStorage + 导入导出模式
- **主题**: 复用已有的 `ThemeProvider`

## 6. 权限控制

**规则**: 管理员可编辑所有配置，普通用户仅可查看

| 操作 | 管理员 | 普通用户 |
|------|--------|----------|
| 查看扩展配置列表 | ✅ | ✅ |
| 添加/编辑/删除配置 | ✅ | ❌ |
| 导入/导出配置 | ✅ | ❌ |
| 测试 MCP 连接 | ✅ | ❌ |

**实现方式**:
- 从 `sessionStorage` 获取用户角色（`roleLabel`）
- 页面加载时根据角色控制操作按钮的显示/隐藏
- 编辑表单在非管理员访问时为只读状态

## 7. 验证方式

1. 启动前端 `npm run dev`（端口 3105）
2. 侧边栏出现「扩展管理」入口
3. 访问 `/extensions` 页面，四个 Tab 切换正常
4. 测试增删改查操作
5. 测试导入/导出 JSON 功能
6. 刷新页面验证 localStorage 持久化
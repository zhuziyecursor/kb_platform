# 文档索引

## 目录结构

```
docs/
├── README.md                          ← 本文件：文档索引
├── architecture/                      ← 系统架构 & 总体设计
│   ├── implementation-handbook.md      ← 实施手册：架构、流程、数据模型、接口
│   └── database-design-analysis.md     ← 数据库推演：逐表逐字段详解、数据扭转
├── optimization/                      ← 全局优化规划
│   └── roadmap.md                     ← 优化路线图：P0-P4 优先级排序
├── features/                          ← 功能模块技术方案
│   ├── space-hierarchy.md             ← 知识空间层级化（自引用树）
│   ├── tags-and-chunk-type.md         ← tags + chunk_type 检索增强
│   ├── smart-chunking.md              ← 智能分片（规则引擎 + LLM 精修）
│   ├── hybrid-retrieval.md            ← 多路召回设计方案（Dense/Sparse/Structured/Metadata/FAQ）
│   ├── hybrid-retrieval-impl.md       ← 多路召回落地实施手册（Sprint/Task/Runbook）
│   └── extension-management.md        ← 扩展管理（提示词/Skills/MCP）
└── planning/                          ← 排期 & 计划
    ├── feature-progress.md             ← 功能进度总览：已完成/部分完成/未完成
    └── schedule-mindmap.html           ← 排期计划思维导图
```

## 阅读路线

### 新手入门

1. 先读根目录 [README.md](../README.md) 了解项目全貌
2. 读 [实施手册](architecture/implementation-handbook.md) — 理解系统架构和核心流程
3. 读 [数据库分析报告](architecture/database-design-analysis.md) — 理解数据模型细节

### 了解优化方向

1. 先读 [优化路线图](optimization/roadmap.md) — 了解全局优先级
2. 读 [功能进度总览](planning/feature-progress.md) — 对齐当前代码已完成和未完成事项
3. 路线图中引用了各功能方案，按需深入：
   - P0 → [空间层级化](features/space-hierarchy.md)
   - P1 → 文档状态可见性（方案在路线图内）
   - P2 → RAG 检索体验优化（方案在路线图内）
   - P3 → Markdown 大纲导入（方案在路线图内）
   - P4 → 空间数据统计看板（方案在路线图内）

### 查阅独立功能方案

- [智能分片](features/smart-chunking.md) — kb-doc-processor 分片策略改造
- [标签与分片类型](features/tags-and-chunk-type.md) — Milvus 检索维度增强
- [多路召回设计方案](features/hybrid-retrieval.md) — Dense + Sparse + Structured + Metadata + FAQ 五路融合
- [多路召回落地手册](features/hybrid-retrieval-impl.md) — 按 Sprint/Task 分解的可执行方案 + 兜底 + Runbook
- [扩展管理](features/extension-management.md) — 前端扩展配置管理

## 文档间关系

```
architecture/implementation-handbook.md   ←── 系统全景（最基础的文档）
    └── architecture/database-design-analysis.md  ←── 数据层深入展开

optimization/roadmap.md                   ←── 优化总览（中枢）
    ├── features/space-hierarchy.md       ←── P0 优化
    ├── features/tags-and-chunk-type.md   ←── 相关功能方案
    └── features/extension-management.md  ←── 相关功能方案

planning/feature-progress.md              ←── 当前代码功能完成度

features/smart-chunking.md                ←── 独立模块方案（kb-doc-processor）
```

## 命名规范

- 文件名使用英文小写 + 连字符（`implementation-handbook.md`）
- 标题使用中文（`# 企业AI知识库 MVP 实施手册`）
- 新文档放入对应的子目录，勿直接放在 `docs/` 根下

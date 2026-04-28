# 当前会话问题追踪

> 规则：
> - 每个会话聚焦一个主题，完成后标记 `[结束]` 并填写结束时间
> - 新会话追加到文件末尾，不删除历史记录
> - 一个"问题"可以跨多次对话，直到明确完成为止

---

## #001 — 治理框架与项目规范制定

**状态：** `[结束]`
**开始时间：** 2026-04-27
**结束时间：** 2026-04-27

**问题描述：**
在 vibe coding 开始前，制定完整的开发治理框架，包括：
- 服务间调用规则的约束
- 前后端调用方式和规则
- 功能开发进度把控
- 如何保证 AI 先思考再开发（Think-Before-Code）
- 功能与功能之间的隔离

**完成内容：**
- [x] 设计并写入所有 CLAUDE.md 文件（根目录全局规则 + 9 个服务局部规则）
- [x] 创建 `contracts/` 契约先行目录
  - [x] `contracts/openapi/`：ingest-service、rag-service、doc-processor 三个 OpenAPI YAML
  - [x] `contracts/kafka-schemas/`：file-ingest、embed-task 两个 Kafka 消息 JSON Schema
  - [x] `contracts/milvus/`：kb_documents Collection 定义脚本（含 ACL 过滤表达式示例）
- [x] 创建 `kb-infra/init-db/02_service_users.sql`（6 个 DB 用户权限隔离）
- [x] 创建 `doc/FEATURES.md`（功能进度总览）
- [x] 创建 `doc/CURRENT_SESSION.md`（本文件，会话问题追踪）

**关键决策记录：**
1. CLAUDE.md 采用"根目录全局规则 + 子目录局部规则"模型，AI 读取时自动合并
2. 完整落地方案：CLAUDE.md + contracts/ + DB 权限脚本三层约束
3. contracts/ 优先创建：OpenAPI + Kafka Schema + Milvus Collection（数据库权限脚本也纳入但放 kb-infra/）
4. PHASE2 功能用注解/注释占位，Java 抛 UnsupportedOperationException，Python 抛 NotImplementedError

---

## #002 — 开发文档管理体系建设

**状态：** `[结束]`
**开始时间：** 2026-04-27
**结束时间：** 2026-04-27

**问题描述：**
在 `doc/` 目录下建立开发管理文档体系：
1. 功能进度追踪文件（已完成/进行中/计划中）
2. 当前会话问题追踪文件（问题结束后标记，新问题追加）
3. 为后续各类开发文档预留目录结构

**完成内容：**
- [x] 创建 `doc/FEATURES.md`（功能状态总览，覆盖 Sprint 0~5 + 二期）
- [x] 创建 `doc/CURRENT_SESSION.md`（本文件）
- [x] 规划 `doc/` 目录结构（见下方"doc 目录规范"）

**doc 目录规范（已确认）：**
```
doc/
├── FEATURES.md          ← 功能进度总览（本项目唯一的功能状态索引）
├── CURRENT_SESSION.md   ← 会话问题追踪（append-only，问题结束打标）
├── adr/                 ← 架构决策记录（Architecture Decision Records）
│   └── ADR-001-*.md
├── api/                 ← 接口使用说明（面向调用方，比 OpenAPI 更易读）
├── ops/                 ← 运维操作手册（部署、扩容、回滚、告警处理）
└── design/              ← 设计文档（数据流、状态机、关键算法说明）
```

---

<!-- 新会话从此处追加，格式如下：

## #003 — [会话主题]

**状态：** `[进行中]` 或 `[结束]`
**开始时间：** YYYY-MM-DD
**结束时间：** YYYY-MM-DD（结束后填写）

**问题描述：**
...

**完成内容：**
- [ ] 待完成
- [x] 已完成

-->

## #003 — 梳理与确立 MVP 开发阶段顺序

**状态：** `[结束]`
**开始时间：** 2026-04-27
**结束时间：** 2026-04-27

**问题描述：**
根据 MVP 手册内容梳理整体功能，并制定开发阶段顺序。核心要求：先通数据流（前端上传 -> 入库 -> 解析 -> 向量库），再做权限管控（ACL+用户上下文），最后做业务输出（RAG问答+前端展示）。

**完成内容：**
- [x] 分析提取《企业AI知识库MVP实施手册》功能清单，包括前端、网关、Java服务（接入、检索、用户）、Python处理工程。
- [x] 确立三个开发阶段：
  1. 阶段一：知识入库主干链路打通（数据进得来、看得到）
  2. 阶段二：权限管理与用户上下文（数据管得住）
  3. 阶段三：知识检索与 RAG 问答（数据出得去）
- [x] 将开发阶段任务同步记录到此文件中。

---

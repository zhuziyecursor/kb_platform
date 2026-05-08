# 企业AI知识库 MVP 数据库数据推演详细分析报告

> 文档版本：V2.0 基于《企业AI知识库MVP实施手册》
> 分析维度：逐字段解释 → 表间交互 → 数据扭转 → 存储/查询实现

---

## 一、数据模型全貌

系统设计了 **7 张 PostgreSQL 表** + **1 个 Milvus Collection**，对应四层知识分层：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           知识分层与存储对应                                 │
├─────────────┬──────────────────┬────────────────────────────────────────────┤
│   层级      │      存储         │              对应表/集合                    │
├─────────────┼──────────────────┼────────────────────────────────────────────┤
│ Raw层       │ MinIO (S3)        │ 原始文件                                    │
│ Clean层     │ PG + MinIO        │ knowledge_clean                            │
│ Structured层│ PG (JSONB)       │ knowledge_structured                       │
│ Vector层    │ Milvus            │ kb_documents (Collection)                  │
│ 元数据层     │ PG                │ knowledge_doc / knowledge_version / doc_acl│
│ 任务层      │ PG + Kafka        │ embed_task (PG) + embed-task (Kafka)       │
│ 用户上下文   │ PG                │ user_context_cache                         │
└─────────────┴──────────────────┴────────────────────────────────────────────┘
```

---

## 二、逐表逐字段详解

### 2.1 `kb_knowledge.knowledge_doc` — 文档元数据主表（入口）

**职责定位：** 整个系统的元数据中心，记录每份文档的"身份证"，是入库流程的起点、状态追踪的核心表。也是链路A检索时，Milvus 召回结果与 PG 元数据做关联的锚点。

**DDL：**
```sql
CREATE TABLE kb_knowledge.knowledge_doc (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  version         INT NOT NULL DEFAULT 1,
  title           VARCHAR(256),
  source_type     VARCHAR(32) NOT NULL,  -- UPLOAD/CDC/CRAWL/API
  doc_type        VARCHAR(32) NOT NULL,  -- REGULATION/POLICY/AUDIT/...
  src_path        VARCHAR(512) NOT NULL,  -- MinIO S3 路径
  sha256          CHAR(64) NOT NULL,      -- 幂等键
  owner_uid       VARCHAR(64),            -- 上传者
  dept_id         VARCHAR(64),            -- 上传者部门
  sec_level       INT NOT NULL DEFAULT 1, -- 密级 1-5
  region_code     VARCHAR(32) NOT NULL DEFAULT 'CN-NATIONAL',
  biz_domain      VARCHAR(64) NOT NULL DEFAULT 'COMPLIANCE',
  effective_from  DATE,
  effective_to    DATE,
  label_tags      TEXT,                    -- JSON 数组字符串
  status          VARCHAR(16) NOT NULL,    -- DRAFT/PENDING/PROCESSING/READY/FAILED
  retry_count     INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  create_time     TIMESTAMP NOT NULL DEFAULT now(),
  expire_time     TIMESTAMP,
  UNIQUE (tenant_id, doc_id, version)
);
CREATE INDEX idx_doc_tenant_status ON kb_knowledge.knowledge_doc (tenant_id, status);
CREATE INDEX idx_doc_tenant_seclevel ON kb_knowledge.knowledge_doc (tenant_id, sec_level);
```

**逐字段解释：**

| # | 字段名 | 类型 | 存在意义 | 典型值示例 |
|---|--------|------|---------|-----------|
| 1 | `id` | BIGSERIAL | PG自增主键，提供高效主键访问 | 1, 2, 3... |
| 2 | `tenant_id` | VARCHAR(64) | **多租户隔离**，所有查询默认条件 | "t1", "corp_001" |
| 3 | `doc_id` | VARCHAR(128) | **全系统唯一文档标识符**，跨链路定位文档 | "DOC20260427001" |
| 4 | `version` | INT | **版本号**，支持同一文档多版本并存，版本号递增 | 1, 2, 3 |
| 5 | `title` | VARCHAR(256) | 文档可读标题，检索结果展示必需 | "采购管理办法 v7" |
| 6 | `source_type` | VARCHAR(32) | **来源类型**：UPLOAD=用户上传, CDC=数据变更捕获, CRAWL=爬虫, API=接口接入 | "UPLOAD" |
| 7 | `doc_type` | VARCHAR(32) | **业务分类**，用于知识分类统计和权限隔离 | "REGULATION"(制度), "POLICY"(政策), "AUDIT"(审计) |
| 8 | `src_path` | VARCHAR(512) | **MinIO S3 路径**，Parser从这里拉取原始文件 | "kb-raw/t1/COMPLIANCE/UPLOAD/2026/04/DOC001/采购办法.pdf" |
| 9 | `sha256` | CHAR(64) | **SHA-256 哈希值**，与 tenant_id 组合作为幂等键，防止同一文件重复上传 | "a3f5b8..." |
| 10 | `owner_uid` | VARCHAR(64) | 文档上传者 UID，追溯责任人 | "u12345" |
| 11 | `dept_id` | VARCHAR(64) | 上传者所属部门，辅助权限判定和归属统计 | "D01" |
| 12 | `sec_level` | INT | **文档密级**（1=普通, 2=内部, 3=机密, 4=高度机密, 5=绝密），ACL预过滤核心字段 | 1, 2, 3, 4, 5 |
| 13 | `region_code` | VARCHAR(32) | **适用地域码**，决定文档在哪些地区生效 | "CN-NATIONAL"(全国), "CN-EAST"(华东), "GLOBAL" |
| 14 | `biz_domain` | VARCHAR(64) | **业务域**，知识分类维度之一 | "COMPLIANCE"(合规), "HR"(人力), "FINANCE"(财务) |
| 15 | `effective_from` | DATE | **生效日期**，控制文档何时开始可被检索 | "2026-01-01" |
| 16 | `effective_to` | DATE | **失效日期**，控制文档何时停止可被检索，空值=永久有效 | "2026-12-31" 或 NULL |
| 17 | `label_tags` | TEXT | **自定义标签**，JSON 数组格式存储，如 ["重要", "2026年", "财务"] | "[\"重要\",\"2026年\"]" |
| 18 | `status` | VARCHAR(16) | **文档处理状态机**，追踪入库全链路进度 | DRAFT→PENDING→PROCESSING→READY→FAILED |
| 19 | `retry_count` | INT | **重试计数器**，每次失败后+1，超过 max_retry(3) 则人工介入 | 0, 1, 2, 3 |
| 20 | `last_error` | TEXT | **最近一次错误信息**，记录失败原因和堆栈，供排查 | "Parser timeout at page 15" |
| 21 | `create_time` | TIMESTAMP | 记录创建时间，审计和统计 | "2026-04-27 10:00:00" |
| 22 | `expire_time` | TIMESTAMP | 文档过期时间，用于归档策略 | NULL 或具体时间 |

**唯一约束 `(tenant_id, doc_id, version)` 语义：**
- 同一租户下，doc_id 全局唯一
- version 代表该 doc_id 的第 N 个版本
- 意味着 `(t1, DOC001, 1)` 和 `(t1, DOC001, 2)` 是同一文档的不同版本，不是两条独立文档

---

### 2.2 `kb_knowledge.knowledge_clean` — 清洗层（Parser 输出）

**职责定位：** 存储 kb-doc-processor 中 **Parser 解析 + Cleaner 清洗** 的结果。是"Raw 层 → Clean 层"转换的终点，也是 Chunker（切片器）的输入数据源。

**DDL：**
```sql
CREATE TABLE kb_knowledge.knowledge_clean (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  src_path        VARCHAR(512) NOT NULL,       -- MinIO 原始文件路径（备份溯源）
  sha256          CHAR(64) NOT NULL,
  cleaned_text    TEXT,                         -- ≤100KB 小文档直接存文本
  clean_text_path VARCHAR(512),                 -- >100KB 大文档存 MinIO 路径，PG 只存引用
  language        VARCHAR(16) NOT NULL DEFAULT 'zh',
  parse_method    VARCHAR(32) NOT NULL DEFAULT 'TIKA',  -- TIKA/OCR
  quality_score   NUMERIC(5,2) NOT NULL DEFAULT 0,      -- 0-100
  meta_json       JSONB NOT NULL DEFAULT '{}',           -- 解析元数据
  created_time    TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_id, sha256),
  CONSTRAINT chk_clean_text_or_path CHECK (
    (cleaned_text IS NOT NULL AND clean_text_path IS NULL) OR
    (cleaned_text IS NULL AND clean_text_path IS NOT NULL)
  )
);
```

**逐字段解释：**

| # | 字段名 | 类型 | 存在意义 | 典型值示例 |
|---|--------|------|---------|-----------|
| 1 | `id` | BIGSERIAL | PG自增主键 | 1, 2, 3... |
| 2 | `tenant_id` | VARCHAR(64) | 多租户隔离 | "t1" |
| 3 | `doc_id` | VARCHAR(128) | 关联父文档 | "DOC001" |
| 4 | `src_path` | VARCHAR(512) | **原始文件 MinIO 路径**，用于溯源或重解析 | "kb-raw/t1/.../DOC001/original.pdf" |
| 5 | `sha256` | CHAR(64) | **幂等键**，判断同一文档是否已清洗过 | "a3f5b8..." |
| 6 | `cleaned_text` | TEXT | **清洗后文本**（小文档 ≤100KB），Chunker 直接消费此字段 | "第一章 总则\n第一条 为了规范采购行为..." |
| 7 | `clean_text_path` | VARCHAR(512) | **大文档 (>100KB)** 清洗文本的 MinIO 路径，PG 只存路径引用，Chunker 需要先下载到本地再处理 | "kb-clean/t1/.../DOC001/cleaned.txt" |
| 8 | `language` | VARCHAR(16) | **文档语言**，决定后续 Chunker 的语言模型策略 | "zh", "en", "mixed" |
| 9 | `parse_method` | VARCHAR(32) | **解析方式**：TIKA=文件解析, OCR=扫描件识别 | "TIKA", "OCR" |
| 10 | `quality_score` | NUMERIC(5,2) | **清洗质量分**（0-100），由 QualityCleaner 计算，反映文本可读性 | 85.50 |
| 11 | `meta_json` | JSONB | **解析元数据**，包含页数、段落数、表格数、布局信息等 | `{"pages": 15, "paragraphs": 230, "tables": 3}` |
| 12 | `created_time` | TIMESTAMP | 创建时间 | "2026-04-27 10:05:00" |

**分层存储策略（cleaned_text vs clean_text_path）：**
- `cleaned_text IS NOT NULL`：文档较小（≤100KB），文本直接存在 PG 中，Chunker 可直接 SQL 查询读取
- `clean_text_path IS NOT NULL`：文档较大（>100KB），清洗后文本存 MinIO，PG 只存路径引用，Chunker 需要先下载到本地再处理
- **CHECK 约束**保证两者二选一，避免数据二义性

**与 `knowledge_doc` 的关系：**
- 通过 `(tenant_id, doc_id)` 关联
- 注意：**没有外键约束**，仅通过业务逻辑保证一致性
- `knowledge_clean` 的 `sha256` 来自 `knowledge_doc.sha256`，用于幂等判断

---

### 2.3 `kb_knowledge.knowledge_structured` — 结构化层

**职责定位：** 将清洗后的文本按文档物理结构（章节/段落/页码）组织为 JSONB，是 **SemanticChunker（语义切片器）** 的输入数据源。相比 FixedLengthChunker，SemanticChunker 按文档结构边界切片，保留语义完整性。

**DDL：**
```sql
CREATE TABLE kb_knowledge.knowledge_structured (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  version         INT NOT NULL,
  json_body       JSONB NOT NULL,  -- {"sections": [{"section_path": "1/1.2", "page": 3, "paragraphs": [...]}]}
  extractor_ver   VARCHAR(32) NOT NULL DEFAULT 'v1',
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, doc_id, version)
);
```

**逐字段解释：**

| # | 字段名 | 类型 | 存在意义 | 典型值示例 |
|---|--------|------|---------|-----------|
| 1 | `id` | BIGSERIAL | PG自增主键 | 1, 2, 3... |
| 2 | `tenant_id` | VARCHAR(64) | 多租户隔离 | "t1" |
| 3 | `doc_id` | VARCHAR(128) | 关联父文档 | "DOC001" |
| 4 | `version` | INT | **版本号**，与 knowledge_doc.version 对应，支持同一文档多版本 | 1, 2 |
| 5 | `json_body` | JSONB | **结构化文档体**，嵌套 JSON，包含层级结构 | 见下方详细示例 |
| 6 | `extractor_ver` | VARCHAR(32) | **结构提取器版本**，提取逻辑升级时旧版本可追溯 | "v1", "v2" |
| 7 | `created_at` | TIMESTAMP | 创建时间 | "2026-04-27 10:06:00" |

**`json_body` 典型结构：**
```json
{
  "title": "采购管理办法",
  "total_pages": 15,
  "sections": [
    {
      "section_path": "1",
      "section_title": "第一章 总则",
      "page": 1,
      "paragraphs": [
        {
          "para_id": "1-1",
          "text": "第一条 为了规范采购行为...",
          "char_count": 128
        },
        {
          "para_id": "1-2",
          "text": "第二条 适用范围包括...",
          "char_count": 256
        }
      ]
    },
    {
      "section_path": "1/1.2",
      "section_title": "第一节 采购流程",
      "page": 3,
      "paragraphs": [...]
    }
  ],
  "tables": [
    {
      "table_id": "T1",
      "page": 8,
      "section_path": "3/3.1",
      "rows": 10,
      "cols": 5,
      "caption": "采购审批权限表"
    }
  ]
}
```

**设计意图：**
- SemanticChunker 读取 `section_path` 和 `paragraphs`，按语义边界（章节、段落）切分，而不是固定 token 数切分
- `extractor_ver` 支持提取器版本升级后的历史追溯和重解析

---

### 2.4 `kb_knowledge.knowledge_version` — 版本状态机

**职责定位：** 独立管理**每个版本**的独立状态，是"文档版本软下线"机制的核心支撑表。注意：`knowledge_doc.status` 是文档当前版本的状态，而 `knowledge_version.status` 是每个版本自己的状态，两者是独立维护的。

**DDL：**
```sql
CREATE TABLE kb_knowledge.knowledge_version (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            VARCHAR(64) NOT NULL,
  doc_id               VARCHAR(128) NOT NULL,
  version              INT NOT NULL,
  status               VARCHAR(16) NOT NULL,  -- PENDING/PROCESSING/READY/FAILED/OFFBOARDED/DEPRECATED
  created_by           VARCHAR(64) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT now(),
  deprecate_at         TIMESTAMP,              -- 计划下线时间
  superseded_by_version INT,                   -- 替代版本号
  UNIQUE (tenant_id, doc_id, version)
);
CREATE INDEX idx_version_tenant_status ON kb_knowledge.knowledge_version (tenant_id, status);
```

**逐字段解释：**

| # | 字段名 | 类型 | 存在意义 | 典型值示例 |
|---|--------|------|---------|-----------|
| 1 | `id` | BIGSERIAL | PG自增主键 | 1, 2, 3... |
| 2 | `tenant_id` | VARCHAR(64) | 多租户隔离 | "t1" |
| 3 | `doc_id` | VARCHAR(128) | 关联父文档 | "DOC001" |
| 4 | `version` | INT | **具体版本号**，与 knowledge_doc.version 一一对应 | 1, 2 |
| 5 | `status` | VARCHAR(16) | **版本级状态机**，与 knowledge_doc.status 独立 | 见状态说明 |
| 6 | `created_by` | VARCHAR(64) | 版本创建人，审计追溯 | "u12345" |
| 7 | `created_at` | TIMESTAMP | 版本创建时间 | "2026-04-27 10:00:00" |
| 8 | `deprecate_at` | TIMESTAMP | **计划下线时间**，到时间自动触发软下线流程 | "2026-12-31 00:00:00" |
| 9 | `superseded_by_version` | INT | **替代版本号**，指向新版本号，建立版本血缘 | 2（当 version=1 时） |

**`status` 状态详解：**

| 状态 | 含义 | 触发时机 |
|------|------|---------|
| `PENDING` | 版本已创建，等待处理 | commit 后立即写入 |
| `PROCESSING` | 正在解析/向量化中 | kb-doc-processor 开始消费 file-ingest |
| `READY` | 入库完成，可被检索 | vector-service 完成 Milvus upsert |
| `FAILED` | 处理失败，重试耗尽 | retry_count >= max_retry |
| `OFFBOARDED` | **被新版本替代而软下线** | 新版本 READY 后，旧版本自动切换 |
| `DEPRECATED` | **人工废弃**，不再使用 | 管理员手动操作 |

**版本切换的两阶段提交：**
```
阶段1: 新版本提交
  knowledge_doc: version=2, status=PENDING
  knowledge_version: version=2, status=PENDING

阶段2: 新版本就绪
  knowledge_version: version=2, status=READY
  knowledge_version: version=1, status=OFFBOARDED
                     superseded_by_version=2
  knowledge_doc.effective_to: 设置旧版本失效日期
  Milvus: delete (doc_id=DOC001 AND version=1)

阶段3: 旧版本向量异步删除（5分钟后）
  Milvus delete by doc_id + version
```

---

### 2.5 `kb_knowledge.doc_acl` — 文档访问控制列表

**职责定位：** 细粒度权限配置表，支持 USER（直接用户）/ ROLE（角色）/ DEPT（部门）三种授权维度。是链路A检索时 Milvus ACL 预过滤的**数据源**，也是 ACL 二次校验的查询表。

**DDL：**
```sql
CREATE TABLE kb_knowledge.doc_acl (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  accessor_type   VARCHAR(16) NOT NULL,  -- USER/ROLE/DEPT
  accessor_id     VARCHAR(128) NOT NULL,
  permission      VARCHAR(16) NOT NULL DEFAULT 'READ',  -- READ/WRITE/ADMIN
  acl_version     BIGINT NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, doc_id, accessor_type, accessor_id)
);
CREATE INDEX idx_acl_tenant_doc ON kb_knowledge.doc_acl (tenant_id, doc_id);
CREATE INDEX idx_acl_accessor ON kb_knowledge.doc_acl (accessor_type, accessor_id);
```

**逐字段解释：**

| # | 字段名 | 类型 | 存在意义 | 典型值示例 |
|---|--------|------|---------|-----------|
| 1 | `id` | BIGSERIAL | PG自增主键 | 1, 2, 3... |
| 2 | `tenant_id` | VARCHAR(64) | 多租户隔离 | "t1" |
| 3 | `doc_id` | VARCHAR(128) | 被授权的文档 | "DOC001" |
| 4 | `accessor_type` | VARCHAR(16) | **授权类型**：USER=直接用户, ROLE=角色, DEPT=部门 | "USER", "ROLE", "DEPT" |
| 5 | `accessor_id` | VARCHAR(128) | **被授权者 ID**，根据 accessor_type 决定含义 | "u12345" 或 "ROLE_FINANCE" 或 "D01" |
| 6 | `permission` | VARCHAR(16) | **权限级别**：READ=可读, WRITE=可编辑, ADMIN=管理 | "READ", "WRITE", "ADMIN" |
| 7 | `acl_version` | BIGINT | **ACL 版本号**，每次 ACL 变更时递增，用于 Milvus 向量同步判断 | 1, 2, 3 |

**三种授权维度的语义：**
- `USER`：直接给某个用户授权 → `accessor_id = "u12345"`，精确到人
- `ROLE`：给某个角色授权 → `accessor_id = "ROLE_COMPLIANCE_OFFICER"`，该角色下的所有用户继承
- `DEPT`：给某个部门授权 → `accessor_id = "D01"`，该部门及子部门的所有用户继承

**`acl_version` 的核心作用：**
- ACL 变更（新增/删除/修改权限）时，acl_version +1
- vector-service 感知到 acl_version 变化后，需要更新 Milvus 中该文档所有 chunk 的 `acl_version` 字段
- Milvus 不支持原地更新，需要 delete 旧向量 + upsert 新向量
- **这是数据扭转的关键连接点**（见第五章）

---

### 2.6 `kb_knowledge.embed_task` — 向量化任务队列表

**职责定位：** 跟踪每个 chunk 的向量化任务状态，是 vector-service 的任务持久化表。注意：这里的 `embed_task` 是 **PostgreSQL 表**，而架构中提到的 `embed-task` 是 **Kafka 消息**，两者配合工作——Kafka 消息是实时队列触发，PG 表是任务持久化和幂等保障。

**DDL：**
```sql
CREATE TABLE kb_knowledge.embed_task (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  doc_id          VARCHAR(128) NOT NULL,
  version         INT NOT NULL,
  chunk_seq       INT NOT NULL,
  text_hash       CHAR(64) NOT NULL,     -- 幂等键
  title           VARCHAR(256),
  section_path    VARCHAR(256),
  page            INT,
  dept_id         VARCHAR(64),
  sec_level       INT NOT NULL DEFAULT 1,
  region_code     VARCHAR(32) NOT NULL DEFAULT 'CN-NATIONAL',
  biz_domain      VARCHAR(64) NOT NULL DEFAULT 'COMPLIANCE',
  perm_group_id   BIGINT,
  acl_version     BIGINT NOT NULL DEFAULT 1,
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING/PROCESSING/DONE/FAILED
  milvus_pk       BIGINT,               -- Milvus 主键回写
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 3,
  error_code      VARCHAR(64),
  error_msg       TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now(),
  processed_at    TIMESTAMP,
  UNIQUE (tenant_id, doc_id, version, chunk_seq, text_hash)
);
CREATE INDEX idx_embed_task_status ON kb_knowledge.embed_task (status, created_at);
```

**逐字段解释：**

| # | 字段名 | 类型 | 存在意义 | 典型值示例 |
|---|--------|------|---------|-----------|
| 1 | `id` | BIGSERIAL | PG自增主键 | 1, 2, 3... |
| 2 | `tenant_id` | VARCHAR(64) | 多租户隔离 | "t1" |
| 3 | `doc_id` | VARCHAR(128) | 所属文档 | "DOC001" |
| 4 | `version` | INT | 所属版本 | 1, 2 |
| 5 | `chunk_seq` | INT | **切片序号**，标识这是该文档的第几个 chunk | 0, 1, 2, 3... |
| 6 | `text_hash` | CHAR(64) | **文本内容哈希**，联合唯一键的一部分，幂等保障 | "b4c9d1..." |
| 7 | `title` | VARCHAR(256) | **文档标题**，召回后展示引用来源 | "采购管理办法 v7" |
| 8 | `section_path` | VARCHAR(256) | **章节路径**，召回后展示"第X页 / 第X节" | "1/1.2/1.2.3" |
| 9 | `page` | INT | **页码**，召回后展示引用页码 | 3 |
| 10 | `dept_id` | VARCHAR(64) | 所属部门，用于统计和权限相关 | "D01" |
| 11 | `sec_level` | INT | **文档密级**，Milvus ACL 预过滤字段之一 | 1, 2, 3 |
| 12 | `region_code` | VARCHAR(32) | **地域码**，Milvus ACL 预过滤字段之一 | "CN-NATIONAL" |
| 13 | `biz_domain` | VARCHAR(64) | **业务域**，Milvus ACL 预过滤字段之一 | "COMPLIANCE" |
| 14 | `perm_group_id` | BIGINT | **权限组 ID**（聚合结果），Milvus ACL 预过滤核心字段 | 101, 102 |
| 15 | `acl_version` | BIGINT | **ACL 版本号**，Milvus 向量同步判断依据 | 1, 2, 3 |
| 16 | `status` | VARCHAR(16) | **任务状态**：PENDING=等待, PROCESSING=处理中, DONE=完成, FAILED=失败 | "DONE" |
| 17 | `milvus_pk` | BIGINT | **Milvus 主键回写**，后续 update/delete Milvus 向量时的定位键 | 88729983 |
| 18 | `retry_count` | INT | 当前重试次数 | 0, 1, 2, 3 |
| 19 | `max_retries` | INT | 最大重试次数 | 3 |
| 20 | `error_code` | VARCHAR(64) | 错误码 | "EMBED_TIMEOUT" |
| 21 | `error_msg` | TEXT | 错误详情 | "embedding service timeout after 30s" |
| 22 | `created_at` | TIMESTAMP | 任务创建时间 | "2026-04-27 10:07:00" |
| 23 | `updated_at` | TIMESTAMP | 最后更新时间 | "2026-04-27 10:07:30" |
| 24 | `processed_at` | TIMESTAMP | 处理完成时间，用于 SLA 监控（5分钟内是否完成） | "2026-04-27 10:09:00" |

**唯一约束 `(tenant_id, doc_id, version, chunk_seq, text_hash)` 语义：**
- 确保同一版本、同一文档、同一序号的同一文本内容，不会重复创建向量化任务
- 如果 commit 同一版本但文本有局部变化（doc_id+version 不变），则 text_hash 不同，不会被幂等拦截

---

### 2.7 `kb_user.user_context_cache` — 用户上下文缓存

**职责定位：** 缓存用户登录后的权限上下文（角色/部门/密级/地域/业务域/权限组），避免每次检索请求都调用 user-service。是链路A检索时构建 Milvus filter 参数和 ACL 二次校验的数据源。

**DDL：**
```sql
CREATE TABLE kb_user.user_context_cache (
  uid             VARCHAR(64) PRIMARY KEY,
  tenant_id       VARCHAR(64) NOT NULL,
  username        VARCHAR(128),
  display_name    VARCHAR(128),
  email           VARCHAR(256),
  role_codes      TEXT[],        -- PostgreSQL 数组类型
  dept_ids        TEXT[],
  sec_level       INT NOT NULL DEFAULT 1,
  region_scopes   TEXT[],
  biz_domain_scopes TEXT[],
  perm_group_ids  BIGINT[],
  ctx_ver         BIGINT NOT NULL DEFAULT 1,
  ctx_hash        CHAR(64),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  cached_at       TIMESTAMP NOT NULL DEFAULT now(),
  expires_at      TIMESTAMP
);
CREATE INDEX idx_user_context_tenant ON kb_user.user_context_cache (tenant_id);
```

**逐字段解释：**

| # | 字段名 | 类型 | 存在意义 | 典型值示例 |
|---|--------|------|---------|-----------|
| 1 | `uid` | VARCHAR(64) | **用户 ID**，作为主键 | "u12345" |
| 2 | `tenant_id` | VARCHAR(64) | 多租户隔离 | "t1" |
| 3 | `username` | VARCHAR(128) | 用户名 | "zhang_san" |
| 4 | `display_name` | VARCHAR(128) | 显示名称 | "张三" |
| 5 | `email` | VARCHAR(256) | 用户邮箱 | "zhangsan@company.com" |
| 6 | `role_codes` | TEXT[] | **用户角色列表**（PG 数组），来自 user-service | `{"ROLE_COMPLIANCE", "ROLE_AUDITOR"}` |
| 7 | `dept_ids` | TEXT[] | **用户部门列表**（PG 数组），支持用户属于多部门 | `{"D01", "D02"}` |
| 8 | `sec_level` | INT | **用户密级**，ACL 判定：用户 sec_level ≥ 文档 sec_level 才可访问 | 3 |
| 9 | `region_scopes` | TEXT[] | **用户可访问地域列表**（PG 数组） | `{"CN-NATIONAL", "CN-EAST"}` |
| 10 | `biz_domain_scopes` | TEXT[] | **用户可访问业务域列表**（PG 数组） | `{"COMPLIANCE", "HR"}` |
| 11 | `perm_group_ids` | BIGINT[] | **用户所属权限组 ID 列表**（PG 数组），由 doc_acl 聚合计算而来 | `{101, 102, 205}` |
| 12 | `ctx_ver` | BIGINT | 上下文版本号，每次刷新 +1 | 1, 2, 3 |
| 13 | `ctx_hash` | CHAR(64) | 上下文内容哈希，用于判断是否需要刷新 | "c7f3a8..." |
| 14 | `is_active` | BOOLEAN | **缓存有效性**，用户登出后置 false | true / false |
| 15 | `cached_at` | TIMESTAMP | 缓存时间 | "2026-04-27 09:00:00" |
| 16 | `expires_at` | TIMESTAMP | 过期时间（OBO token 有效期 5 分钟） | "2026-04-27 09:05:00" |

**`perm_group_ids` 的聚合生成逻辑：**
```
用户 u12345 属于部门 D01，角色 ROLE_COMPLIANCE

1. 查询 doc_acl 中所有匹配记录：
   - (doc=DOC001, accessor_type=USER, accessor_id=u12345) → perm_group_id=101
   - (doc=DOC001, accessor_type=DEPT, accessor_id=D01)   → perm_group_id=102
   - (doc=DOC001, accessor_type=ROLE, accessor_id=ROLE_COMPLIANCE) → perm_group_id=205

2. 去重后得到用户 u12345 对 DOC001 的 perm_group_ids = [101, 102, 205]

3. 检索时 Milvus filter:
   "perm_group_id in [101, 102, 205]"
```

---

## 三、Milvus Collection：`kb_documents` 逐字段详解

**职责定位：** 存储所有文档 chunk 的向量和元数据，是语义检索的核心引擎。检索时通过向量相似度 + ACL 预过滤返回候选 chunks，再经 Rerank 精排后供 LLM 生成答案。

**Collection Schema：**

| # | 字段名 | Milvus 类型 | 存在意义 | 典型值示例 |
|---|--------|------------|---------|-----------|
| 1 | `id` | INT64 (PK, auto) | Milvus 自动生成的主键 | 88729983 |
| 2 | `doc_id` | VARCHAR | 文档 ID，用于定位文档 | "DOC001" |
| 3 | `tenant_id` | VARCHAR | 租户 ID，**用于分区（partition key）** | "t1" |
| 4 | `version` | INT32 | 版本号，版本切换时删除旧向量 | 1, 2 |
| 5 | `chunk_seq` | INT32 | 切片序号，同一文档内唯一 | 0, 1, 2... |
| 6 | `vector` | FLOAT_VECTOR(1024) | **BGE-Zh 模型生成的 1024 维向量** | `[0.123, -0.456, ...]` |
| 7 | `text` | VARCHAR(4096) | **原始文本片段**，供 LLM 引用和 Rerank | "第一条 为了规范采购行为..." |
| 8 | `title` | VARCHAR | 文档标题，召回结果展示 | "采购管理办法 v7" |
| 9 | `section_path` | VARCHAR | 章节路径，召回结果展示引用来源 | "1/1.2" |
| 10 | `page` | INT32 | 页码，召回结果展示 | 3 |
| 11 | `sec_level` | INT32 | **文档密级，ACL 预过滤字段** | 1, 2, 3, 4, 5 |
| 12 | `region_code` | VARCHAR | **地域码，ACL 预过滤字段** | "CN-NATIONAL" |
| 13 | `biz_domain` | VARCHAR | **业务域，ACL 预过滤字段** | "COMPLIANCE" |
| 14 | `perm_group_id` | INT64 | **权限组 ID（聚合），ACL 预过滤核心字段**，支持 in [a,b,c] 过滤 | 101 |
| 15 | `effective_from` | VARCHAR | 生效日期（字符串格式），过滤逻辑用 | "2026-01-01" |
| 16 | `effective_to` | VARCHAR | 失效日期（空=永久有效），过滤逻辑用 | "2026-12-31" 或 "" |
| 17 | `owner_uid` | VARCHAR | 上传者 ID，追溯用 | "u12345" |
| 18 | `acl_version` | INT64 | **ACL 版本号**，acl 变更时用于判断 Milvus 向量是否需要同步 | 1, 2, 3 |
| 19 | `create_time` | INT64 | 创建时间（Unix epoch），排序和统计用 | 1745731200 |

**索引设计：**
```
vector_index: HNSW (M=32, efConstruction=200)
  - 高召回率，HNSW 在 M=32 时 recall 高
  - efConstruction=200 平衡索引构建速度和查询性能

filter_indexes (标量字段索引):
  - tenant_id      (等值查询，每个 query 都带)
  - sec_level      (范围查询，ACL 预过滤)
  - perm_group_id  (集合查询，in [a,b,c])
  - region_code    (等值查询)
  - effective_to   (范围查询，失效过滤)
```

**搜索语法示例：**
```python
search(
    vector=query_vector,                    # 用户问题的 embedding
    collection_name="kb_documents",
    filter=
        "tenant_id == 't1'"               # 多租户隔离
        " AND sec_level <= 3"              # 用户密级 ≥ 文档密级
        " AND perm_group_id in [101, 102, 205]"  # 用户权限组匹配
        " AND (effective_to == '' OR effective_to > '2026-04-27')"  # 未失效
        " AND region_code in ['CN-NATIONAL', 'CN-EAST']"  # 地域匹配
        " AND biz_domain in ['COMPLIANCE']", # 业务域匹配
    topk=20,                                # 召回 Top20（粗排）
    output_fields=["doc_id", "version", "chunk_seq", "text",
                   "title", "section_path", "page", "perm_group_id",
                   "effective_from", "effective_to"]
)
# 返回后由 rag-service 做 Rerank 精排至 Top5，再构造 Prompt
```

---

## 四、表与表之间的交互关系

### 4.1 交互全景图

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              表间交互全景图                                          │
│                                                                                     │
│  [knowledge_doc] ─────────── 1:N ─────────── [knowledge_version]                      │
│       │                                                  │                          │
│       │ 1:1 (同一 doc_id+version)                       │ 状态联动                 │
│       │                                                  ▼                          │
│       ├─────────────────────── 1:N ────────────────── [embed_task] ────→ [Milvus]     │
│       │                                                                             │
│       │                                                                             │
│  [doc_acl] ───────────── N:1 ─────────── [knowledge_doc]                              │
│       │                                                                             │
│       │ 聚合计算                                                                   │
│       ▼                                                                             │
│  [user_context_cache]                                                              │
│       │                                                                             │
│       │ perm_group_ids[] 注入                                                      │
│       ▼                                                                             │
│  [Milvus] ─── Rerank ──── [rag_service] ──── LLM ──── 用户                         │
│                                                                                     │
│  [knowledge_clean] ── Chunker 读取 ──→ [knowledge_structured]                        │
│       │                                                                             │
│       │ Parser/Cleaner 写入                                                        │
│       ▼                                                                             │
│  [MinIO] ─── Parser 读取原始文件                                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 核心交互关系详解

#### 关系1️⃣：`knowledge_doc` ↔ `knowledge_version`（1:N）

```
每创建一个新版本：
  knowledge_doc (id=1)
    └── version=1, status=READY
    └── version=2, status=PENDING  ← 新增

  knowledge_version
    └── (doc_id=DOC001, version=1, status=READY)
    └── (doc_id=DOC001, version=2, status=PENDING)  ← 新增

语义：
  - knowledge_doc.version 是当前版本的快照
  - knowledge_version.status 是每个版本自己的状态
  - 两者通过 (tenant_id, doc_id, version) 关联
```

#### 关系2️⃣：`knowledge_doc` ↔ `doc_acl`（1:N）

```
一份文档，多个权限规则：
  knowledge_doc: doc_id=DOC001, version=2
    └── doc_acl: (doc_id=DOC001, accessor_type=USER,  accessor_id=u001, permission=READ)
    └── doc_acl: (doc_id=DOC001, accessor_type=DEPT,  accessor_id=D01,  permission=READ)
    └── doc_acl: (doc_id=DOC001, accessor_type=ROLE,  accessor_id=ROLE_FINANCE, permission=READ)

语义：
  - 一个 doc_id 可以有多条 ACL 规则
  - ACL 规则变更 → acl_version +1
  - 向量化时，ingest-service 需要将 N 条 ACL 规则聚合成 perm_group_ids 写入 Milvus
```

#### 关系3️⃣：`doc_acl` → `user_context_cache`（N:M，通过 perm_group_id 聚合）

```
用户登录时，user-service 聚合用户所有权限组：
  用户 u001 属于部门 D01，角色 ROLE_FINANCE

  查询 doc_acl:
    SELECT accessor_type, accessor_id
    FROM doc_acl
    WHERE tenant_id='t1' AND doc_id='DOC001'
    结果：
      (USER, u001), (DEPT, D01), (ROLE, ROLE_FINANCE)

  转换为 perm_group_ids:
    perm_group_id = hash(tenant_id + accessor_type + accessor_id) % 2^63
    = [hash("t1"+"USER"+"u001"), hash("t1"+"DEPT"+"D01"), hash("t1"+"ROLE"+"ROLE_FINANCE")]
    = [101, 102, 205]

  写入 user_context_cache.perm_group_ids = [101, 102, 205]
```

#### 关系4️⃣：`knowledge_clean` → `knowledge_structured` → `embed_task`（1:1:1 每版本）

```
文档 DOC001 版本=1 的数据流：
  knowledge_clean: doc_id=DOC001, sha256=abc123
    └── knowledge_structured: doc_id=DOC001, version=1, json_body={sections}
    └── embed_task: doc_id=DOC001, version=1, chunk_seq=0, text_hash=xxx
    └── embed_task: doc_id=DOC001, version=1, chunk_seq=1, text_hash=yyy
    └── ...

语义：
  - knowledge_clean 是 Parser/Cleaner 输出（全文）
  - knowledge_structured 是 Chunker 读取并结构化后的结果
  - embed_task 是 Chunker 切片后，每个 chunk 对应的向量化任务
```

#### 关系5️⃣：`embed_task` ↔ `Milvus`（1:1）

```
embed_task 是 Milvus 向量的 PG 映射：
  embed_task.milvus_pk = Milvus.id

  写入流程：
    embed_task INSERT (status=PENDING)
    → vector-service 消费 embed_task
    → Milvus upsert(id=auto, vector=..., doc_id=DOC001, ...)
    → Milvus 返回生成的 id
    → embed_task UPDATE (status=DONE, milvus_pk=返回的id)

  删除流程（版本下线时）：
    Milvus delete by (doc_id=DOC001 AND version=1)
    → 无需通过 milvus_pk 逐条删除
```

---

## 五、PostgreSQL 与 Milvus 的数据扭转全流程

### 5.1 入库流程（链路B）数据扭转

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          链路B：知识入库数据扭转流程                                 │
│                                                                                     │
│  阶段1: init-upload (前端 → ingest-service)                                         │
│  ─────────────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│  用户选择文件 + 元数据 ──→ ingest-service                                            │
│                                  │                                                  │
│                                  ▼                                                  │
│                           ❶ 幂等检查                                                 │
│                           SELECT * FROM knowledge_doc                               │
│                           WHERE tenant_id='t1' AND sha256='abc123'                   │
│                           ─────────────────────────────────────────                 │
│                           存在 → 返回已有的 doc_id（重复上传）                        │
│                           不存在 → 继续                                              │
│                                                                                     │
│                           ❷ knowledge_doc INSERT (status=DRAFT)                     │
│                           id=1, doc_id='DOC001', version=1, status='DRAFT'          │
│                           src_path='kb-raw/t1/.../DOC001/original.pdf'               │
│                           sha256='abc123', sec_level=1, region_code='CN-NATIONAL'   │
│                                                                                     │
│                           ❸ 申请 MinIO presigned URL                                 │
│                           返回给前端: "https://minio/...?signature=***"             │
│                                                                                     │
│  阶段2: 浏览器直传 MinIO                                                             │
│  ─────────────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│  浏览器 ──────────────────────────────────────────────────────────→ MinIO          │
│             PUT kb-raw/t1/COMPLIANCE/UPLOAD/2026/04/DOC001/original.pdf              │
│                                                                                     │
│  阶段3: commit (前端 → ingest-service)                                               │
│  ─────────────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│  前端点击提交(附ACL) ──→ ingest-service                                               │
│                                  │                                                  │
│                                  ▼                                                  │
│                           ❹ knowledge_doc UPDATE (status=PENDING)                  │
│                                                                                     │
│                           ❺ doc_acl INSERT (多条)                                    │
│                           (tenant_id='t1', doc_id='DOC001',                         │
│                            accessor_type='USER', accessor_id='u001',                 │
│                            permission='READ', acl_version=1)                        │
│                           (DEPT, D01, READ, 1)                                      │
│                           (ROLE, ROLE_FINANCE, READ, 1)                             │
│                                                                                     │
│                           ❻ knowledge_version INSERT (status=PENDING)              │
│                           (tenant_id='t1', doc_id='DOC001', version=1,             │
│                            status='PENDING', created_by='u001')                      │
│                                                                                     │
│                           ❼ Kafka(file-ingest) 消息发布                             │
│                           {tenant_id, doc_id, version, src_path, ...}              │
│                           ────────────────────────────────────────→ Kafka          │
│                                                                                     │
│  阶段4: 异步解析 (kb-doc-processor 消费 file-ingest)                                │
│  ─────────────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│  kb-doc-processor 消费 Kafka(file-ingest)                                          │
│                                  │                                                  │
│                                  ▼                                                  │
│                           ❽ Parser 解析                                              │
│                           从 MinIO src_path 下载原始文件                             │
│                           Tika/PdfParser → 文本 + 页码 + 布局                        │
│                           输出: {pages: [{page_num: 1, text: "...", layout: "..."}]} │
│                                                                                     │
│                           ❾ knowledge_clean INSERT/UPDATE                          │
│                           tenant_id='t1', doc_id='DOC001', sha256='abc123'         │
│                           cleaned_text='第一章 总则...', parse_method='TIKA'       │
│                           quality_score=85.50, meta_json={pages: 15}                │
│                                                                                     │
│                           ⑩ Cleaner 清洗                                             │
│                           TextCleaner: 去除特殊字符、HTML标签、乱码                  │
│                           PIIFilter: 脱敏（身份证、手机号等）                        │
│                           QualityCleaner: 打质量分                                  │
│                           输出: 干净文本 + quality_score                             │
│                           → knowledge_clean UPDATE (quality_score=85.50)          │
│                                                                                     │
│                           ⑪ SemanticChunker 切片                                    │
│                           读取 knowledge_structured.json_body                      │
│                           按 section_path/paragraph 边界切分                        │
│                           输出: chunks = [{chunk_seq:0, text:"...", page:1},       │
│                                        {chunk_seq:1, text:"...", page:2}, ...]      │
│                                                                                     │
│                           ⑫ knowledge_structured INSERT                            │
│                           tenant_id='t1', doc_id='DOC001', version=1               │
│                           json_body={sections: [...], total_pages:15}             │
│                                                                                     │
│  阶段5: 向量化 (vector-service 消费 Kafka embed-task)                               │
│  ─────────────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│  ⑬ Kafka(embed-task) 消息发布                                                       │
│  {tenant_id, doc_id, version, chunks: [...]}                                       │
│  ────────────────────────────────────────→ Kafka                                    │
│                                                                                     │
│  vector-service 消费 Kafka(embed-task)                                              │
│                                  │                                                  │
│                                  ▼                                                  │
│                           ⑭ 计算 perm_group_ids                                     │
│                           查询 doc_acl WHERE tenant_id='t1' AND doc_id='DOC001'   │
│                           聚合 accessor_type+accessor_id → hash → perm_group_ids   │
│                           结果: perm_group_ids = [101, 102, 205]                    │
│                           acl_version = 1                                          │
│                                                                                     │
│                           ⑮ embed_task INSERT (多条，每个 chunk 一条)              │
│                           chunk_seq=0, text_hash='xxx', status='PENDING'          │
│                           perm_group_id=101(聚合值), acl_version=1                 │
│                           sec_level=1, region_code='CN-NATIONAL', biz_domain='...' │
│                           (实际是多个 perm_group_id，每个 perm_group_id 一条记录)     │
│                                                                                     │
│                           ⑯ embedding-service 调用                                 │
│                           POST embedding-service/v1/embed                                                  │
│                           body: {texts: [chunk0_text, chunk1_text, ...]}          │
│                           model: BGE-Zh (服务端固定，不接受传参)                      │
│                           返回: {embeddings: [[0.1, -0.2, ...], [...], ...]}         │
│                                                                                     │
│                           ⑰ Milvus upsert (批量)                                    │
│                           for each chunk:                                          │
│                             Milvus.insert({                                        │
│                               doc_id: 'DOC001',                                    │
│                               version: 1,                                           │
│                               chunk_seq: 0,                                        │
│                               vector: [0.1, -0.2, ...],  (1024维)                  │
│                               text: '第一章 总则...',                               │
│                               title: '采购管理办法 v7',                            │
│                               section_path: '1/1',                                  │
│                               page: 1,                                              │
│                               sec_level: 1,                                         │
│                               region_code: 'CN-NATIONAL',                           │
│                               biz_domain: 'COMPLIANCE',                             │
│                               perm_group_id: 101,  ← 注意只写一个 perm_group_id    │
│                               effective_from: '2026-01-01',                         │
│                               effective_to: '',                                     │
│                               owner_uid: 'u001',                                     │
│                               acl_version: 1,                                      │
│                               create_time: 1745731200                              │
│                             })                                                      │
│                           ────────────────────────────────────────────→ Milvus     │
│                           注意：一个 chunk 对多个 perm_group_id 时，需要拆成多条    │
│                                即 chunk_seq=0, perm_group_id=101 一条               │
│                                    chunk_seq=0, perm_group_id=102 一条               │
│                                    chunk_seq=0, perm_group_id=205 一条               │
│                                检索时用 perm_group_id in [...] 过滤                  │
│                                                                                     │
│                           ⑱ embed_task UPDATE (status=DONE, milvus_pk=xxx)          │
│                           (每个 chunk 完成后更新)                                    │
│                                                                                     │
│                           ⑲ knowledge_version UPDATE (status=READY)               │
│                           WHERE tenant_id='t1' AND doc_id='DOC001' AND version=1  │
│                           更新后状态: status='READY'                                │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 检索流程（链路A）数据扭转

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          链路A：知识检索数据扭转流程                                 │
│                                                                                     │
│  阶段1: OBO Token 获取 (上层应用 → auth-adapter)                                     │
│  ─────────────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│  用户输入问题 ──→ 上层应用(Dify/IM)                                                  │
│                          │                                                         │
│                          ▼                                                         │
│                   ❶ Token Exchange (RFC8693 OBO)                                   │
│                   POST auth-adapter/oauth2/token                                    │
│                   body: {grant_type=urn:ietf:params:oauth2:grant-type:token-exchange,│
│                          subject_token=user_access_token,                           │
│                          requested_token_type=urn:ietf:params:oauth2:token-type:access_token}│
│                   ────────────────────────────────────────────→ auth-adapter       │
│                                                                                     │
│                   ❷ auth-adapter 验证 user_token                                    │
│                   GET user-service/internal/users/{uid}/context                      │
│                   ←──────────────────────────────────────────── user-service        │
│                   返回: {uid, tenant_id, role_codes, dept_ids, sec_level,           │
│                          region_scopes, biz_domain_scopes, perm_group_ids}         │
│                                                                                     │
│                   ❸ user_context_cache 读写                                        │
│                   首次: INSERT INTO user_context_cache (uid, tenant_id,              │
│                          role_codes, dept_ids, sec_level, region_scopes,            │
│                          biz_domain_scopes, perm_group_ids, ctx_ver=1)             │
│                   缓存命中: 检查 ctx_hash 是否变化，变化则 UPDATE                     │
│                   刷新后的 perm_group_ids = 聚合所有 doc_acl 得来                   │
│                                                                                     │
│                   ❹ 生成 OBO token                                                 │
│                   JWT payload: {aud: 'mcp-kb', exp: +5min,                          │
│                                  uid, tenant_id, sec_level,                         │
│                                  perm_group_ids: [101, 102, 205]}                   │
│                   ←────────────────────────────────────────────── auth-adapter       │
│                                                                                     │
│  阶段2: RAG 检索与生成                                                               │
│  ─────────────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│  上层应用 ──→ rag-service /rag/v1/chat                                              │
│                         query + OBO token                                           │
│                         │                                                           │
│                         ▼                                                           │
│                   ❺ Gateway 验证 OBO token                                          │
│                   校验 aud='mcp-kb', scope='kb:search', tenant_id, exp              │
│                   通过后，将 perm_group_ids=[101,102,205] 注入请求上下文           │
│                                                                                     │
│                   ❻ Query 改写 (rag-service)                                        │
│                   同义词扩展: "采购" → "采购、招标、投标、供应链"                    │
│                   输出: 改写后 query + 原始 query                                    │
│                                                                                     │
│                   ❼ 关键词兜底 (rag-service)                                         │
│                   精确匹配条款编号、制度名称                                          │
│                   如果 query 包含 "第3.2.1条" → 走 PostgreSQL 全文检索补充           │
│                   → knowledge_structured.json_body @> '"第3.2.1条"'                │
│                                                                                     │
│                   ❽ embedding-service 调用                                         │
│                   POST embedding-service/v1/embed                                    │
│                   body: {texts: [改写后query]}                                      │
│                   返回: {embeddings: [[0.1, -0.2, ...]]}  ← query_vector            │
│                                                                                     │
│                   ❾ Milvus 检索 (Top20 粗排)                                        │
│                   vector-service.search(                                           │
│                       vector=query_vector,                                           │
│                       filter=                                                        │
│                           "tenant_id == 't1'"                                      │
│                           " AND sec_level <= 3"                                     │
│                           " AND perm_group_id in [101, 102, 205]"                  │
│                           " AND (effective_to == '' OR effective_to > '2026-04-27')"│
│                           " AND region_code in ['CN-NATIONAL', 'CN-EAST']"        │
│                           " AND biz_domain in ['COMPLIANCE']",                     │
│                       topk=20                                                       │
│                   )                                                                 │
│                   ────────────────────────────────────────────────────→ Milvus        │
│                   ←──────────────────────────────────────────────────── Top20 chunks│
│                                                                                     │
│                   ⑩ Rerank 精排 (Top20 → Top5)                                      │
│                   rag-service → llm-gateway → rerank model (bge-rerank)           │
│                   输出: Top5 chunks (按相关性得分排序)                               │
│                                                                                     │
│                   ⑪ ACL 二次校验                                                    │
│                   rag-service 查询 doc_acl                                          │
│                   SELECT doc_id, accessor_type, accessor_id FROM doc_acl           │
│                   WHERE tenant_id='t1' AND doc_id IN (召回的doc_ids)                │
│                   ────────────────────────────────────────────────────→ PG         │
│                   ←──────────────────────────────────────────────────── ACL 列表    │
│                   校验用户 u001 的角色/部门是否在召回文档的 ACL 中                    │
│                   如果 ACL 二次校验后 Top5 全部被拒 → 拒答                           │
│                                                                                     │
│                   ⑫ 拒答判断                                                         │
│                   Top5 全被 ACL 拒 → "您没有权限查看相关内容" + trace_id             │
│                   Top5 为空 → "知识库中暂时没有找到相关资料"                         │
│                   有可用召回 → 继续                                                  │
│                                                                                     │
│                   ⑬ 构造 Prompt                                                     │
│                   prompt = "你是一个合规助手，基于以下参考资料回答用户问题。\n"        │
│                           + "【参考1】采购管理办法 v7\n第3页/1.2.3节\n第一条...\n"  │
│                           + "【参考2】...\n\n用户问题：...\n"                        │
│                                                                                     │
│                   ⑭ LLM 生成                                                       │
│                   rag-service → llm-gateway → LLM (GPT-4o / Qwen)                  │
│                   返回: 答案文本 + 引用块 (doc_id, chunk_seq, page, section_path)    │
│                                                                                     │
│  阶段3: 返回结果                                                                     │
│  ─────────────────────────────────────────────────────────────────────────────────  │
│                                                                                     │
│  ⑮ 返回答案                                                                         │
│  {answer: "根据《采购管理办法》...", citations: [...], trace_id: "xxx"}             │
│  ←─────────────────────────────────────────────────────────────────── rag-service   │
│                                                                                     │
│  前端展示：                                                                          │
│  ┌─────────────────────────────────────────────────────────┐                       │
│  │ 问：采购合同审批流程是什么？                              │                       │
│  │                                                         │                       │
│  │ 答：根据《采购管理办法》...（带引用标注）                 │                       │
│  │                                                         │                       │
│  │ 来源：                                                   │                       │
│  │ ①《采购管理办法》v7                                     │                       │
│  │    第3页 / 1.2.3节                                      │                       │
│  │    生效日期：2026-01-01  适用地域：全国                  │                       │
│  │                                                         │                       │
│  └─────────────────────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 六、存储实现角度分析

### 6.1 PostgreSQL 存储分配

| 表名 | 存储类型 | 存储特点 | 大小预估逻辑 |
|------|---------|---------|------------|
| `knowledge_doc` | 行存 | 主键索引 + `(tenant_id, status)` + `(tenant_id, sec_level)` | 每行 ~1KB，1万文档 ~10MB |
| `knowledge_clean` | 行存 + 大字段 | cleaned_text (TEXT) 或 clean_text_path (VARCHAR) | 小文档 ~50KB/行，大文档引用 ~200B/行 |
| `knowledge_structured` | 行存 + JSONB | json_body 弹性存储，section 结构 | 每版本 ~50-500KB JSON |
| `knowledge_version` | 行存 | `(tenant_id, status)` 索引 | 每行 ~200B，1万文档 ~2MB |
| `doc_acl` | 行存 | `(tenant_id, doc_id)` + `(accessor_type, accessor_id)` | 每条 ACL ~100B，10万 ACL 规则 ~10MB |
| `embed_task` | 行存 | `(status, created_at)` 索引，milvus_pk 回写 | 每 chunk ~500B，100万 chunk ~500MB |
| `user_context_cache` | 行存 + PG 数组 | uid 主键，PG ARRAY 类型 (role_codes[], dept_ids[]) | 每用户 ~2KB，1万用户 ~20MB |

### 6.2 MinIO 存储分配

| 路径 | 存储内容 | 大小预估 |
|------|---------|---------|
| `kb-raw/{tenant}/{biz_domain}/{source_type}/{yyyy}/{mm}/{doc_id}/` | 原始上传文件 | MVP: ≤5MB/文件 |
| `kb-clean/{tenant}/{doc_id}/cleaned.txt` | 大文档(>100KB)清洗后文本 | 原始文件 30-50% |

### 6.3 Milvus 存储分配

| 向量维度 | 每条大小 | 100万 chunk 预估 |
|---------|---------|----------------|
| 1024 维 FLOAT | vector: 4KB + metadata: ~1KB | ~5GB |

**分区策略：** 按 `tenant_id` 分区，查询时指定 tenant_id 避免跨租户扫描

---

## 七、查询实现角度分析

### 7.1 核心查询场景与实现

#### 场景A：入库状态查询（用户轮询）

```sql
-- 查询文档当前状态
SELECT d.doc_id, d.version, d.title, d.status,
       v.status as version_status, d.last_error
FROM knowledge_doc d
JOIN knowledge_version v ON (d.tenant_id=v.tenant_id AND d.doc_id=v.doc_id AND d.version=v.version)
WHERE d.tenant_id='t1' AND d.doc_id='DOC001';

-- 索引: idx_doc_tenant_status, idx_version_tenant_status
```

#### 场景B：ACL 聚合查询（用户登录/上下文刷新时）

```sql
-- 查询用户 u001 对文档 DOC001 的所有权限组
SELECT hash('t1'||'USER'||'u001')    % 2^63 as pg_id_1,
       hash('t1'||'DEPT'||'D01')    % 2^63 as pg_id_2,
       hash('t1'||'ROLE'||'FINANCE') % 2^63 as pg_id_3;

-- 或者用 PG 函数直接计算
SELECT hashcmp FROM my_hash_function('t1', 'USER', 'u001');
```

#### 场景C：Milvus ACL 预过滤查询

```python
# 检索时的 filter 构建（Python伪代码）
filter = (
    f"tenant_id == '{tenant_id}'"
    f" AND sec_level <= {user_sec_level}"
    f" AND perm_group_id in {perm_group_ids}"  # [101, 102, 205]
    f" AND (effective_to == '' OR effective_to > '{today}')"
    f" AND region_code in {user_region_scopes}"
    f" AND biz_domain in {user_biz_domain_scopes}"
)
```

#### 场景D：关键词兜底查询（条款编号等精确词）

```sql
-- 当 query 包含 "第3.2.1条" 时，走 PG JSONB 全文检索
SELECT doc_id, version, jsonb_extract_path_text(json_body, 'sections', '0', 'paragraphs', '0', 'text')
FROM knowledge_structured
WHERE tenant_id='t1'
  AND json_body @> '"第3.2.1条"'
  AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
LIMIT 10;
-- 需要 GIN 索引支持: CREATE INDEX idx_structured_json ON knowledge_structured USING GIN (json_body);
```

#### 场景E：版本切换查询（旧版本下线）

```sql
-- 查询某文档所有版本
SELECT doc_id, version, status, superseded_by_version, effective_to
FROM knowledge_version
WHERE tenant_id='t1' AND doc_id='DOC001'
ORDER BY version DESC;

-- 查询需要软下线的旧版本
SELECT doc_id, version FROM knowledge_version
WHERE tenant_id='t1' AND status='READY'
  AND superseded_by_version IS NOT NULL
  AND superseded_by_version > version;
```

#### 场景F：ACL 变更检测（同步 Milvus）

```sql
-- 查询 acl_version 变更的文档
SELECT DISTINCT doc_id, acl_version
FROM doc_acl
WHERE tenant_id='t1'
  AND acl_version > (SELECT MAX(acl_version) FROM embed_task WHERE doc_id=doc_acl.doc_id);
```

---

## 八、总结

### 8.1 数据扭转全景总结

```
入库扭转:
  MinIO(原始文件)
    → kb-doc-processor(Parser)
    → knowledge_clean(PG)
    → Chunker
    → knowledge_structured(PG) + embed_task(PG)
    → Kafka(embed-task)
    → vector-service
    → embedding-service(BGE)
    → Milvus(向量+metadata)

检索扭转:
  用户 query
    → embedding-service(BGE)
    → Milvus(向量检索+ACL预过滤)
    → Top20
    → Rerank(bge-rerank)
    → Top5
    → doc_acl(PG)二次校验
    → Prompt构造
    → LLM
    → 用户
```

### 8.2 设计优秀之处

1. **四层知识分层清晰**：Raw → Clean → Structured → Vector，每层职责明确
2. **版本化设计完备**：knowledge_doc + knowledge_version 双轨状态机，支持版本软下线
3. **ACL 二级防护**：Milvus 预过滤 + PG 二次校验，安全性高
4. **perm_group_id 聚合**：将 N 条 ACL 记录压缩为 INT64 过滤，解决 dept 列表过长问题
5. **embed_task.milvus_pk 回写**：建立 PG → Milvus 的双向索引，便于后续更新/删除
6. **幂等设计**：sha256 + text_hash 双重幂等键，防止重复处理

### 8.3 待确认/待完善风险点

| 优先级 | 风险点 | 说明 |
|-------|--------|------|
| 🔴 高 | **acl_version 变更 → Milvus 向量同步机制** | 当 doc_acl 变更时，Milvus 中已有向量的 acl_version 需要同步更新，但 Milvus 不支持原地更新，需要 delete + upsert，文档中未见此流程的明确描述 |
| 🔴 高 | **perm_group_id 在 PG 中的映射记录缺失** | perm_group_id 是内存计算生成的，PG doc_acl 表中没有存储该值，ACL 变更时无法精确知道哪些 Milvus 向量需要更新 |
| 🟡 中 | **embed_task(PG) 与 Kafka embed-task 的职责边界** | 两者配合方式（PG 是持久化 + 幂等，Kafka 是实时触发）需要在代码层面明确 |
| 🟡 中 | **knowledge_clean 与 knowledge_doc 无外键** | 数据一致性依赖业务层保证，高并发场景可能存在不一致 |
| 🟢 低 | **knowledge_structured.json_body 无 GIN 索引** | 关键词兜底查询走 JSONB 全文检索时需要 GIN 索引，否则全表扫描 |

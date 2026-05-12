/**
 * Mock types for the KB Platform MVP
 * These types are aligned with the OpenAPI contracts in contracts/openapi/
 */

// ============== Document Types ==============

/** Document processing status */
export type DocStatus = 'DRAFT' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

/** Document type classification */
export type DocType = 'REGULATION' | 'POLICY' | 'AUDIT' | 'CONTRACT' | 'MANUAL';

/** Security level */
export type SecLevel = 1 | 2 | 3 | 4 | 5;

/** Pipeline step status */
export type StepStatus = 'wait' | 'process' | 'finish' | 'error';

/** Document metadata */
export interface KnowledgeDoc {
  id: string;
  docId: string;
  tenantId: string;
  title: string;
  version: number;
  docType: DocType;
  sourceType: 'UPLOAD' | 'CDC' | 'CRAWL' | 'API';
  srcPath: string;
  sha256: string;
  ownerUid: string;
  deptId: string;
  secLevel: SecLevel;
  regionCode: string;
  bizDomain: string;
  effectiveFrom: string;
  effectiveTo?: string;
  labelTags: string[];
  status: DocStatus;
  retryCount: number;
  lastError?: string;
  createTime: string;
  expireTime?: string;
}

/** Access control list entry */
export interface DocACL {
  accessorType: 'USER' | 'ROLE' | 'DEPT';
  accessorId: string;
  permission: 'READ' | 'WRITE' | 'ADMIN';
}

/** Document list item for table display */
export interface DocumentListItem {
  key: string;
  docId: string;
  title: string;
  docType: DocType;
  secLevel: SecLevel;
  status: DocStatus;
  ownerUid: string;
  createTime: string;
  effectiveFrom: string;
  bizDomain: string;
  version: number;
}

/** Upload form values */
export interface UploadFormValues {
  filename: string;
  file?: File;
  fileSize: number;
  fileHash: string;
  docType: DocType;
  bizDomain: string;
  regionCode: string;
  secLevel: SecLevel;
  effectiveFrom: string;
  effectiveTo?: string;
  ownerUid: string;
  deptId: string;
  labelTags: string[];
  acl: DocACL[];
}

/** Pipeline step definition */
export interface PipelineStep {
  title: string;
  description: string;
  status: StepStatus;
  timestamp?: string;
  /** 子步骤列表（如解析→TikaParser、元数据识别、段落检测） */
  subSteps?: PipelineSubStep[];
}

/** 子步骤定义 */
export interface PipelineSubStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

// ============== RAG / Chat Types ==============

/** Citation / reference source */
export interface Citation {
  docId: string;
  chunkSeq: number;
  title: string;
  version: number;
  page: number;
  sectionPath: string;
  regionCode: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isCurrent: boolean;
  score: number;
  text: string;
  knowledgeSpaceId?: string;
  spacePath?: string;
}

/** 反馈类型 */
export type FeedbackType = 'LIKE' | 'DISLIKE' | 'REPORT';

/** 报错原因 */
export type ReportReason = 'HALLUCINATION' | 'WRONG_CITATION' | 'IRRELEVANT' | 'OTHER';

/** 反馈记录 */
export interface FeedbackRecord {
  id: number;
  traceId: string;
  tenantId: string;
  uid: string;
  sessionId?: string;
  messageId?: number;
  feedbackType: FeedbackType;
  reportReason?: ReportReason;
  comment?: string;
  confidence?: string;
  createdAt: string;
  updatedAt: string;
}

/** Chat message */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  traceId?: string;
  timestamp: number;
  /** 拒答原因: NO_MATCH / NO_PERMISSION / LOW_CONFIDENCE */
  reason?: string;
  liked?: boolean;
  favorited?: boolean;
  /** 后端返回的消息 ID */
  messageId?: number;
  /** 已提交的反馈类型 */
  feedbackType?: FeedbackType;
  /** 模型自评置信度 */
  confidence?: string;
}

/** Chat session */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ============== LLM Model Types ==============

/** LLM 提供商 */
export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'volcengine' | 'ali' | 'minimax';

/** LLM 模型配置 */
export interface LLMModelConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  apiKey: string;
  modelName: string;
  isDefault?: boolean;
}

/** LLM 提供商元信息 */
export interface LLMProviderInfo {
  value: LLMProvider;
  label: string;
  icon: string;
  defaultModel: string;
}

// ============== LUI / Agentic Types ==============

/** Skill definition */
export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'upload' | 'document' | 'rag' | 'system';
  params?: Record<string, unknown>;
}

/** LUI command action */
export interface LUIAction {
  type: 'OPEN_MODAL' | 'NAVIGATE' | 'CALL_SKILL' | 'SHOW_TOAST' | 'RUN_QUERY';
  payload: Record<string, unknown>;
  confidence: number;
  matchedIntent: string;
}

/** LUI command result */
export interface LUICommandResult {
  action: LUIAction | null;
  suggestions: string[];
  response: string;
}

// ============== Knowledge Space Types ==============

/** 切片模式 */
export type ChunkMode = 'HEAD_FIRST' | 'TAIL_FIRST' | 'UNIFORM' | 'SMART' | 'SMART_LLM';

/** 知识空间可见范围 */
export type SpaceVisibility = 'PUBLIC' | 'TEAM';

/** 切片配置 */
export interface ChunkConfig {
  useSpaceConfig: boolean;
  chunkSize: number;
  overlapRatio: number;
  chunkMode: ChunkMode;
}

/** 知识空间 */
export interface KnowledgeSpace {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  chunkSize: number;
  overlapRatio: number;
  chunkMode: ChunkMode;
  visibility: SpaceVisibility;
  smartParseEnabled: boolean;
  parentId?: string | null;
  nodePath: string;
  depth: number;
  docCount?: number;
  createTime: string;
  updateTime: string;
}

/** 知识空间树节点 */
export interface KnowledgeSpaceTreeNode {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  chunkSize: number;
  overlapRatio: number;
  chunkMode: ChunkMode;
  visibility: SpaceVisibility;
  smartParseEnabled: boolean;
  parentId?: string | null;
  depth: number;
  docCount?: number;
  createTime: string;
  updateTime: string;
  children: KnowledgeSpaceTreeNode[];
}

/** 创建知识空间请求 */
export interface CreateSpaceRequest {
  name: string;
  description?: string;
  chunkSize?: number;
  overlapRatio?: number;
  chunkMode?: ChunkMode;
  visibility?: SpaceVisibility;
  smartParseEnabled?: boolean;
  parentId?: string;
}

// ============== Space ACL Types ==============

/** 空间权限条目 */
export interface SpaceAclEntry {
  accessorType: 'USER' | 'ROLE' | 'DEPT';
  accessorId: string;
  accessorName?: string;
  permission: 'READ' | 'WRITE' | 'ADMIN';
}

/** 知识空间权限配置响应 */
export interface SpaceAclResponse {
  spaceId: string;
  spaceName: string;
  permissions: SpaceAclEntry[];
}

/** 角色-空间绑定视图（前端渲染用） */
export interface RoleSpaceBinding {
  roleCode: string;
  roleName: string;
  spaces: Array<{
    spaceId: string;
    spaceName: string;
    permission: 'READ' | 'WRITE' | 'ADMIN';
  }>;
}

// ============== Stats Dashboard Types ==============

/** 空间文档数统计 */
export interface SpaceDocCount {
  spaceId: string;
  spaceName: string;
  docCount: number;
}

/** 每日文档趋势 */
export interface DailyDocTrend {
  date: string;
  count: number;
}

/** 统计数据概览 */
export interface StatsOverview {
  spaceDocCounts: SpaceDocCount[];
  dailyTrend: DailyDocTrend[];
  pendingCount: number;
  failedCount: number;
  totalVectorCount: number | null;
}

/** 更新知识空间请求 */
export interface UpdateSpaceRequest {
  name?: string;
  description?: string;
  chunkSize?: number;
  overlapRatio?: number;
  chunkMode?: ChunkMode;
  visibility?: SpaceVisibility;
  smartParseEnabled?: boolean;
}

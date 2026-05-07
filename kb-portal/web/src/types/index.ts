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
  docCount?: number;
  createTime: string;
  updateTime: string;
}

/** 创建知识空间请求 */
export interface CreateSpaceRequest {
  name: string;
  description?: string;
  chunkSize?: number;
  overlapRatio?: number;
  chunkMode?: ChunkMode;
  visibility?: SpaceVisibility;
}

/** 更新知识空间请求 */
export interface UpdateSpaceRequest {
  name?: string;
  description?: string;
  chunkSize?: number;
  overlapRatio?: number;
  chunkMode?: ChunkMode;
  visibility?: SpaceVisibility;
}

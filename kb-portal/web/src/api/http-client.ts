import axios from 'axios';
import type { AxiosError } from 'axios';
import type { RetrievalChannel } from '../types';

const httpClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_GATEWAY_URL || '',
  timeout: 60000,
});

interface ApiErrorPayload {
  code?: string;
  message?: string;
  error?: string;
  traceId?: string;
}

export class ApiClientError extends Error {
  status?: number;
  code?: string;
  traceId?: string;
  details?: unknown;

  constructor(message: string, options: {
    status?: number;
    code?: string;
    traceId?: string;
    details?: unknown;
  } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.code = options.code;
    this.traceId = options.traceId;
    this.details = options.details;
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return !!value && typeof value === 'object';
}

export function getErrorMessage(error: unknown, fallback = '请求失败，请稍后再试'): string {
  if (error instanceof ApiClientError) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function toApiClientError(error: AxiosError): ApiClientError {
  const payload = error.response?.data;
  const status = error.response?.status;

  if (isApiErrorPayload(payload)) {
    const message = payload.message || payload.error || error.message;
    return new ApiClientError(message || '请求失败', {
      status,
      code: payload.code,
      traceId: payload.traceId,
      details: payload,
    });
  }

  if (typeof payload === 'string' && payload.trim()) {
    return new ApiClientError(payload, { status, details: payload });
  }

  if (error.code === 'ECONNABORTED') {
    return new ApiClientError('请求超时，请稍后重试', { status });
  }

  return new ApiClientError(error.message || '网络请求失败', { status, details: payload });
}

// 请求拦截：注入 OBO token，禁止注入自定义用户头
httpClient.interceptors.request.use((config) => {
  // In real app, we'll get this from sessionStorage
  // const oboToken = sessionStorage.getItem('obo_token');
  // if (oboToken) config.headers['Authorization'] = `Bearer ${oboToken}`;

  // 确保没有自定义用户头，遵循网关要求
  ['x-user-id', 'x-tenant-id', 'x-roles', 'x-dept-id'].forEach(h => delete config.headers[h]);
  return config;
});

httpClient.interceptors.response.use(
  response => {
    try {
      const traceId = response.headers['x-trace-id'] as string | undefined;
      if (traceId) {
        response.request?.res?.setHeader?.('x-trace-id', traceId);
      }
    } catch {
      // Interceptor must not break the response flow
    }
    return response;
  },
  (error: AxiosError) => Promise.reject(toApiClientError(error))
);

// ============== Document Upload APIs ==============

export interface InitUploadRequest {
  tenantId: string;
  filename: string;
  fileSize: number;
  fileHash: string;
  docType: 'REGULATION' | 'POLICY' | 'AUDIT' | 'CONTRACT' | 'MANUAL' | 'OTHER';
  bizDomain: string;
  regionCode: string;
  secLevel: number;
  effectiveFrom: string;
  ownerUid: string;
  deptId: string;
  knowledgeSpaceId: string;
  labelTags?: string;
  chunkConfig: {
    useSpaceConfig: boolean;
    chunkSize: number;
    overlapRatio: number;
    chunkMode: 'HEAD_FIRST' | 'TAIL_FIRST' | 'UNIFORM' | 'SMART' | 'SMART_LLM';
  };
  overwriteExisting: boolean;
}

export interface InitUploadResponse {
  docId: string;
  presignedUrl: string;
  expireIn: number;
}

export interface VerifyUploadResponse {
  docId: string;
  verified: boolean;
  traceId: string;
}

export interface CommitRequest {
  tenantId: string;
  sha256: string;
  acl: Array<{
    accessorType: 'USER' | 'ROLE' | 'DEPT';
    accessorId: string;
    permission: 'READ' | 'WRITE' | 'ADMIN';
  }>;
}

export interface CommitResponse {
  docId: string;
  version: number;
  status: string;
}

export interface IngestResponse {
  docId: string;
  version: number;
  status: string;
  message: string;
  traceId: string;
}

export interface DocStatusResponse {
  docId: string;
  version: number;
  status: 'DRAFT' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'OFFBOARDED' | 'DEPRECATED';
  retryCount: number;
  lastError: string | null;
  traceId: string;
}

/**
 * Initialize document upload - get docId and presigned URL
 */
export const initUpload = (request: InitUploadRequest): Promise<InitUploadResponse> => {
  return httpClient.post<InitUploadResponse>('/kb/v1/docs/init-upload', request).then(res => res.data);
};

/**
 * Verify that file was successfully uploaded to MinIO via presigned URL
 */
export const verifyUpload = (docId: string, version: number): Promise<VerifyUploadResponse> => {
  return httpClient.post<VerifyUploadResponse>(`/kb/v1/docs/${docId}/verify-upload`, null, { params: { version } }).then(res => res.data);
};

/**
 * Commit document with SHA256 and ACL
 */
export const commitDoc = (docId: string, version: number, request: CommitRequest): Promise<CommitResponse> => {
  return httpClient.post<CommitResponse>(`/kb/v1/docs/${docId}/commit`, request, { params: { version } }).then(res => res.data);
};

/**
 * Trigger document ingestion/processing
 */
export const ingestDoc = (docId: string, version: number): Promise<IngestResponse> => {
  return httpClient.post<IngestResponse>(`/kb/v1/docs/${docId}/ingest`, null, { params: { version } }).then(res => res.data);
};

/**
 * Get document processing status (for polling)
 */
export const getDocStatus = (docId: string, version: number): Promise<DocStatusResponse> => {
  return httpClient.get<DocStatusResponse>(`/kb/v1/docs/${docId}/status`, { params: { version } }).then(res => res.data);
};

/**
 * Upload file through backend proxy (replaces browser direct upload to MinIO)
 */
export const uploadFile = (docId: string, version: number, file: File): Promise<{ docId: string; success: boolean; message: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  return httpClient.post(`/kb/v1/docs/${docId}/upload`, formData, {
    params: { version },
    // 不手动设置 Content-Type，浏览器/axios 自动带正确的 boundary
  }).then(res => res.data);
};

/**
 * List documents with optional space filter
 */
export const listDocs = (spaceId?: string, limit?: number): Promise<DocListResponse> => {
  return httpClient.get<DocListResponse>('/kb/v1/docs', { params: { spaceId, limit } }).then(res => res.data);
};

/**
 * Get document file for preview/download (returns blob)
 */
export const getDocFile = (docId: string, version: number = 1): Promise<Blob> => {
  return httpClient.get(`/kb/v1/docs/${docId}/download`, {
    params: { version },
    responseType: 'blob',
  }).then(res => res.data);
};

/**
 * Get document preview info (presigned URL + metadata) for citation source navigation.
 * Front-end can use previewUrl with #page=N or #search=text for PDF positioning and highlighting.
 */
export const getDocPreview = (docId: string, version: number = 1, page?: number, highlight?: string): Promise<DocPreviewResponse> => {
  return httpClient.get<DocPreviewResponse>(`/kb/v1/docs/${docId}/preview`, {
    params: { version, page, highlight },
  }).then(res => res.data);
};

/**
 * Retry a failed document — resets status to PENDING and re-triggers ingestion
 */
export const retryDoc = (docId: string, version: number = 1): Promise<IngestResponse> => {
  return httpClient.post<IngestResponse>(`/kb/v1/docs/${docId}/retry`, null, { params: { version } }).then(res => res.data);
};

/**
 * Delete a document (deletes from MinIO and database)
 */
export const deleteDoc = (docId: string, version: number = 1): Promise<void> => {
  return httpClient.delete(`/kb/v1/docs/${docId}`, { params: { version } }).then(res => res.data);
};

export interface DocListResponse {
  docs: DocSummary[];
  total: number;
}

export interface DocFileResponse {
  resource: Blob;
  contentType: string;
  previewType: string;
  filename: string;
}

export interface DocPreviewResponse {
  docId: string;
  version: number;
  title: string;
  previewUrl: string;
  previewType: string;
  page: number | null;
  highlight: string | null;
  expireIn: number;
}

export const getDoc = (docId: string): Promise<DocSummary | null> =>
  listDocs().then(res => res.docs.find(d => d.docId === docId) ?? null);

export interface DocSummary {
  docId: string;
  title: string;
  version: number;
  docType: string;
  status: string;
  secLevel: number;
  bizDomain: string;
  regionCode: string;
  ownerUid: string;
  deptId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  labelTags: string | null;
  srcPath: string;
  createTime: string | null;
  fileSize: number | null;
  knowledgeSpaceId: string;
}

// ============== Document Processor APIs (debug/internal) ==============

const processorClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_PROCESSOR_URL || 'http://localhost:31001',
  timeout: 30000,
});

processorClient.interceptors.response.use(
  response => response,
  (error: AxiosError) => Promise.reject(toApiClientError(error))
);

export interface ChunkInfo {
  chunkSeq: number;
  text: string;
  charCount: number;
  charStart: number;
  charEnd: number;
  sectionPath: string | null;
  status: string;
}

export interface DocChunksResponse {
  docId: string;
  version: number;
  totalChunks: number;
  cleanedText: string;
  chunks: ChunkInfo[];
  traceId: string;
}

/**
 * Get chunk visualization data for a document
 */
export const getDocChunks = (docId: string, version: number = 1): Promise<DocChunksResponse> => {
  return processorClient.get<DocChunksResponse>(`/api/v1/docs/${docId}/chunks`, { params: { version } }).then(res => res.data);
};

// ============== RAG Chat API ==============

export interface RagChatRequest {
  tenantId: string;
  sessionId?: string;
  biz?: string;
  lang?: 'zh' | 'en';
  query: string;
  topK?: number;
  spaceId?: string;
  systemPrompt?: string;
  mode?: 'rag' | 'assistant';
}

export interface RagChatResponse {
  answer: string;
  citations: Citation[];
  traceId: string;
  reason?: 'NO_MATCH' | 'NO_PERMISSION' | 'LOW_CONFIDENCE';
  sessionId?: string;
  messageId?: number;
  confidence?: string;
  intent?: string;
  searchMode?: string;
  channelStats?: Record<RetrievalChannel, number>;
}

export interface Citation {
  docId: string;
  chunkSeq: number;
  title: string;
  version: number;
  page: number;
  sectionPath?: string;
  regionCode?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isCurrent: boolean;
  score: number;
  text: string;
  knowledgeSpaceId?: string;
  spacePath?: string;
  sourceChannels?: RetrievalChannel[];
  channelRanks?: Record<RetrievalChannel, number>;
}

export interface StageEvent {
  stage: string;
  status: 'SUCCESS' | 'ERROR' | 'SKIPPED';
  durationMs: number;
  elapsedMs: number;
  summary?: Record<string, unknown>;
}

/**
 * Send a RAG chat query to the retrieval pipeline (blocking)
 */
export const ragChat = (request: RagChatRequest): Promise<RagChatResponse> => {
  return httpClient.post<RagChatResponse>('/rag/v1/chat', request).then(res => res.data);
};

export const agentChat = (request: RagChatRequest): Promise<RagChatResponse> => {
  return ragChat(request);
};

/**
 * Streaming RAG chat: consumes SSE from /rag/v1/chat/stream
 */
export const ragChatStream = async (
  request: RagChatRequest,
  onToken: (token: string) => void,
  onDone: (result: RagChatResponse) => void,
  onError?: (message: string) => void,
  onStage?: (event: StageEvent) => void
): Promise<void> => {
  const baseUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || '';
  const response = await fetch(`${baseUrl}/rag/v1/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '请求失败');
    onError?.(errText);
    throw new ApiClientError(errText, { status: response.status });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.slice(5).trim();
        } else if (line === '' && currentEvent && currentData) {
          if (currentEvent === 'token') {
            const parsed = JSON.parse(currentData);
            onToken(parsed.token);
          } else if (currentEvent === 'done') {
            const parsed = JSON.parse(currentData);
            onDone(parsed);
            return;
          } else if (currentEvent === 'error') {
            const parsed = JSON.parse(currentData);
            onError?.(parsed.message || '流式请求出错');
            throw new ApiClientError(parsed.message || '流式请求出错');
          } else if (currentEvent === 'stage') {
            const parsed = JSON.parse(currentData);
            onStage?.(parsed);
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

// ============== RAG Session APIs ==============

export interface RagSessionSummary {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface RagMessageItem {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  citations: string | null;
  traceId: string | null;
  createdAt: number;
}

export const listSessions = (tenantId: string, userId: string): Promise<RagSessionSummary[]> => {
  return httpClient.get<RagSessionSummary[]>('/rag/v1/sessions', {
    params: { tenantId, userId },
  }).then(res => res.data);
};

export const createSession = (tenantId: string, userId: string): Promise<{ sessionId: string }> => {
  return httpClient.post<{ sessionId: string }>('/rag/v1/sessions', {
    tenantId, userId,
  }).then(res => res.data);
};

export const getSessionMessages = (sessionId: string, tenantId: string): Promise<RagMessageItem[]> => {
  return httpClient.get<RagMessageItem[]>(`/rag/v1/sessions/${sessionId}/messages`, {
    params: { tenantId },
  }).then(res => res.data);
};

export const deleteSession = (sessionId: string, tenantId: string): Promise<void> => {
  return httpClient.delete(`/rag/v1/sessions/${sessionId}`, {
    params: { tenantId },
  }).then(res => res.data);
};

// ============== RAG Pipeline Trace APIs ==============

export interface RagPipelineStageTiming {
  stage: string;
  status: 'SUCCESS' | 'ERROR' | string;
  durationMs: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface RagPipelineHitDoc {
  docId?: string;
  title?: string;
  score?: number;
  version?: number;
  page?: number;
  spacePath?: string;
}

export interface RagPromptBudgetStats {
  enabled?: boolean;
  inputBudgetTokens?: number;
  estimatedPromptTokens?: number;
  includedHistoryTurns?: number;
  droppedHistoryTurns?: number;
  includedCitations?: number;
  droppedCitations?: number;
  truncatedCitations?: number;
}

export interface RagPipelineTraceResponse {
  traceId: string;
  tenantId: string;
  uid: string;
  sessionId?: string;
  queryText?: string;
  rewrittenQuery?: string;
  spaceId?: string;
  lang: string;
  cacheHit: boolean;
  stream: boolean;
  result: string;
  refusalReason?: string;
  totalMs: number;
  firstTokenMs?: number;
  stageTimings: RagPipelineStageTiming[];
  recallCount: number;
  aclFilteredCount: number;
  rerankCount: number;
  citationsCount: number;
  hitDocs: RagPipelineHitDoc[];
  promptBudget?: RagPromptBudgetStats;
  errorMessage?: string;
  createdAt: string;
}

export const getPipelineTrace = (traceId: string): Promise<RagPipelineTraceResponse> => {
  return httpClient.get<RagPipelineTraceResponse>(`/rag/v1/traces/${traceId}`).then(res => res.data);
};

// ============== Pipeline Trace List API ==============

export interface RagPipelineTraceSummary {
  traceId: string;
  tenantId: string;
  uid: string;
  sessionId?: string;
  queryText?: string;
  rewrittenQuery?: string;
  spaceId?: string;
  lang: string;
  cacheHit: boolean;
  stream: boolean;
  result: string;
  refusalReason?: string;
  totalMs: number;
  firstTokenMs?: number;
  recallCount: number;
  aclFilteredCount: number;
  rerankCount: number;
  citationsCount: number;
  errorMessage?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface ListTracesParams {
  tenantId: string;
  result?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export const listPipelineTraces = (params: ListTracesParams): Promise<PaginatedResponse<RagPipelineTraceSummary>> => {
  return httpClient.get<PaginatedResponse<RagPipelineTraceSummary>>('/rag/v1/traces', { params }).then(res => res.data);
};

// ============== Stats API ==============

export interface StatsOverviewResponse {
  spaceDocCounts: Array<{
    spaceId: string;
    spaceName: string;
    docCount: number;
  }>;
  dailyTrend: Array<{
    date: string;
    count: number;
  }>;
  pendingCount: number;
  failedCount: number;
  totalVectorCount: number | null;
}

/**
 * Get dashboard stats overview including space distribution, daily trend, and alerts
 */
export const getStatsOverview = (): Promise<StatsOverviewResponse> => {
  return httpClient.get<StatsOverviewResponse>('/kb/v1/stats/overview').then(res => res.data);
};

// ============== Feedback APIs ==============

export interface FeedbackRequest {
  traceId: string;
  feedbackType: 'LIKE' | 'DISLIKE' | 'REPORT';
  reportReason?: 'HALLUCINATION' | 'WRONG_CITATION' | 'IRRELEVANT' | 'OTHER';
  comment?: string;
}

export interface FeedbackResponse {
  id: number;
  traceId: string;
  tenantId: string;
  uid: string;
  sessionId?: string;
  messageId?: number;
  feedbackType: string;
  reportReason?: string;
  comment?: string;
  confidence?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Submit feedback for a RAG answer (like/dislike/report)
 */
export const submitFeedback = (request: FeedbackRequest): Promise<FeedbackResponse> => {
  return httpClient.post<FeedbackResponse>('/rag/v1/feedback', request).then(res => res.data);
};

/**
 * Get existing feedback for a specific trace
 */
export const getFeedback = (traceId: string): Promise<FeedbackResponse | null> => {
  return httpClient.get<FeedbackResponse>(`/rag/v1/feedback/${traceId}`)
    .then(res => res.data)
    .catch(err => {
      if (err.response?.status === 404) return null;
      throw err;
    });
};

// ============== Feedback List API ==============

export interface ListFeedbackParams {
  tenantId: string;
  feedbackType?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export const listFeedback = (params: ListFeedbackParams): Promise<PaginatedResponse<FeedbackResponse>> => {
  return httpClient.get<PaginatedResponse<FeedbackResponse>>('/rag/v1/feedback/list', { params }).then(res => res.data);
};

// ============== Badcase List API ==============

export interface BadcaseItem {
  id: number;
  feedbackId: number;
  traceId: string;
  tenantId: string;
  sessionId?: string;
  queryText: string;
  rewrittenQuery?: string;
  answer: string;
  citations?: string;
  feedbackType: string;
  reportReason?: string;
  comment?: string;
  traceSummary?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListBadcasesParams {
  tenantId: string;
  status?: string;
  feedbackType?: string;
  reportReason?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export const listBadcases = (params: ListBadcasesParams): Promise<PaginatedResponse<BadcaseItem>> => {
  return httpClient.get<PaginatedResponse<BadcaseItem>>('/rag/v1/badcases', { params }).then(res => res.data);
};

// ============== Dashboard Metrics API ==============

export interface DashboardMetrics {
  period: string;
  totalRequests: number;
  successRate: number;
  avgResponseMs: number;
  refusalRate: number;
  feedbackStats: {
    likeCount: number;
    dislikeCount: number;
    reportCount: number;
    likeRate: number;
  };
  topSlowQueries: Array<{
    query: string;
    avgMs: number;
    count: number;
    p95Ms: number;
  }>;
  refusalTrend: Array<{
    label: string;
    value: number;
    count: number;
  }>;
  requestTrend: Array<{
    label: string;
    value: number;
    count: number;
  }>;
}

export const getDashboardMetrics = (tenantId: string, period?: string, slowQueryLimit?: number): Promise<DashboardMetrics> => {
  return httpClient.get<DashboardMetrics>('/rag/v1/analytics/dashboard', {
    params: { tenantId, period, slowQueryLimit },
  }).then(res => res.data);
};

// ============== Badcase Management APIs ==============

export const updateBadcaseStatus = (id: number, status: string): Promise<{ id: number; status: string; updatedAt: string }> => {
  return httpClient.patch(`/rag/v1/badcases/${id}/status`, { status }).then(res => res.data);
};

// ============== Doc Audit Log API ==============

export interface DocAuditItem {
  id: number;
  ts: string;
  traceId?: string;
  tenantId: string;
  uid: string;
  action: string;
  docId?: string;
  version?: number;
  result: string;
  errorCode?: string;
  errorMsg?: string;
  detail?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ListDocAuditParams {
  tenantId: string;
  action?: string;
  result?: string;
  page?: number;
  size?: number;
}

export const listDocAudit = (params: ListDocAuditParams): Promise<PaginatedResponse<DocAuditItem>> => {
  return httpClient.get<PaginatedResponse<DocAuditItem>>('/rag/v1/docs/audit', { params }).then(res => res.data);
};

// ============== Evaluation Dataset APIs ==============

export interface EvalDatasetItem {
  datasetId: string;
  tenantId: string;
  name: string;
  description?: string;
  sourceType: string;
  sourcePath?: string;
  fileCount: number;
  totalChunks: number;
  totalQaPairs: number;
  qaConfig?: Record<string, unknown>;
  status: string;
  progress?: Record<string, unknown>;
  traceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvalQaPairItem {
  pairId: string;
  datasetId: string;
  question: string;
  answer: string;
  qaType: string;
  sourceChunkIds: string[];
  sourceDocPath?: string;
  difficulty: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface EvalRunItem {
  runId: string;
  datasetId: string;
  tenantId: string;
  status: string;
  config?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  progress?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface EvalQaResultItem {
  id: number;
  runId: string;
  pairId: string;
  ragAnswer?: string;
  ragTraceId?: string;
  exactMatch?: boolean;
  f1Score?: number;
  recall?: number;
  llmJudgeScore?: number;
  llmJudgeReason?: string;
  citationsCount?: number;
  latencyMs?: number;
  createdAt: string;
}

// Dataset CRUD
export const createDataset = (req: { name: string; description?: string; sourceType: string; sourcePath?: string; fileList?: string[]; tenantId?: string; qaConfig?: Record<string, unknown> }): Promise<EvalDatasetItem> => {
  return httpClient.post<EvalDatasetItem>('/rag/v1/eval/datasets', req).then(res => res.data);
};

export const listDatasets = (tenantId: string, page = 0, size = 20): Promise<{ items: EvalDatasetItem[]; total: number; page: number; size: number }> => {
  return httpClient.get('/rag/v1/eval/datasets', { params: { tenantId, page, size } }).then(res => res.data);
};

export const getDataset = (datasetId: string): Promise<EvalDatasetItem> => {
  return httpClient.get<EvalDatasetItem>(`/rag/v1/eval/datasets/${datasetId}`).then(res => res.data);
};

export const deleteDataset = (datasetId: string): Promise<void> => {
  return httpClient.delete(`/rag/v1/eval/datasets/${datasetId}`).then(() => undefined);
};

// QA Pairs
export const listQaPairs = (datasetId: string, qaType?: string, difficulty?: string, page = 0, size = 50): Promise<{ items: EvalQaPairItem[]; total: number; page: number; size: number }> => {
  return httpClient.get(`/rag/v1/eval/datasets/${datasetId}/pairs`, { params: { qaType, difficulty, page, size } }).then(res => res.data);
};

// Generation SSE
export const generateDataset = async (
  datasetId: string,
  onStage: (event: StageEvent) => void,
  onDone: (result: { datasetId: string; totalQa: number; durationMs: number }) => void,
  onError?: (message: string) => void
): Promise<void> => {
  const baseUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || '';
  const response = await fetch(`${baseUrl}/rag/v1/eval/datasets/${datasetId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '生成请求失败');
    onError?.(errText);
    throw new ApiClientError(errText, { status: response.status });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.slice(5).trim();
        } else if (line === '' && currentEvent && currentData) {
          if (currentEvent === 'stage') {
            onStage(JSON.parse(currentData));
          } else if (currentEvent === 'done') {
            onDone(JSON.parse(currentData));
            return;
          } else if (currentEvent === 'error') {
            const parsed = JSON.parse(currentData);
            onError?.(parsed.message || '生成出错');
            throw new ApiClientError(parsed.message || '生成出错');
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

export const getGenerationProgress = (datasetId: string): Promise<{ status: string; progress: Record<string, unknown> }> => {
  return httpClient.get(`/rag/v1/eval/datasets/${datasetId}/progress`).then(res => res.data);
};

// Evaluation Runs
export const createEvalRun = (req: { datasetId: string; tenantId?: string; config?: Record<string, unknown> }): Promise<EvalRunItem> => {
  return httpClient.post<EvalRunItem>('/rag/v1/eval/runs', req).then(res => res.data);
};

export const getEvalRun = (runId: string): Promise<EvalRunItem> => {
  return httpClient.get<EvalRunItem>(`/rag/v1/eval/runs/${runId}`).then(res => res.data);
};

export const listEvalRuns = (datasetId: string): Promise<EvalRunItem[]> => {
  return httpClient.get<EvalRunItem[]>(`/rag/v1/eval/datasets/${datasetId}/runs`).then(res => res.data);
};

export const executeEvalRun = async (
  runId: string,
  onStage: (event: StageEvent) => void,
  onDone: (result: { runId: string; metrics: Record<string, unknown> }) => void,
  onError?: (message: string) => void
): Promise<void> => {
  const baseUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || '';
  const response = await fetch(`${baseUrl}/rag/v1/eval/runs/${runId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '评测请求失败');
    onError?.(errText);
    throw new ApiClientError(errText, { status: response.status });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.slice(5).trim();
        } else if (line === '' && currentEvent && currentData) {
          if (currentEvent === 'stage') {
            onStage(JSON.parse(currentData));
          } else if (currentEvent === 'done') {
            onDone(JSON.parse(currentData));
            return;
          } else if (currentEvent === 'error') {
            const parsed = JSON.parse(currentData);
            onError?.(parsed.message || '评测出错');
            throw new ApiClientError(parsed.message || '评测出错');
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

export const listEvalResults = (runId: string, page = 0, size = 50): Promise<{ items: EvalQaResultItem[]; total: number; page: number; size: number }> => {
  return httpClient.get(`/rag/v1/eval/runs/${runId}/results`, { params: { page, size } }).then(res => res.data);
};

export default httpClient;

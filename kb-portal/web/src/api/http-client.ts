import axios from 'axios';

const httpClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_GATEWAY_URL || '',
  timeout: 60000,
});

// 请求拦截：注入 OBO token，禁止注入自定义用户头
httpClient.interceptors.request.use((config) => {
  // In real app, we'll get this from sessionStorage
  // const oboToken = sessionStorage.getItem('obo_token');
  // if (oboToken) config.headers['Authorization'] = `Bearer ${oboToken}`;

  // 确保没有自定义用户头，遵循网关要求
  ['x-user-id', 'x-tenant-id', 'x-roles', 'x-dept-id'].forEach(h => delete config.headers[h]);
  return config;
});

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
}

export interface RagChatResponse {
  answer: string;
  citations: Citation[];
  traceId: string;
  reason?: 'NO_MATCH' | 'NO_PERMISSION' | 'LOW_CONFIDENCE';
  sessionId?: string;
  messageId?: number;
  confidence?: string;
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
}

/**
 * Send a RAG chat query to the retrieval pipeline (blocking)
 */
export const ragChat = (request: RagChatRequest): Promise<RagChatResponse> => {
  return httpClient.post<RagChatResponse>('/rag/v1/chat', request).then(res => res.data);
};

/**
 * Streaming RAG chat: consumes SSE from /rag/v1/chat/stream
 */
export const ragChatStream = async (
  request: RagChatRequest,
  onToken: (token: string) => void,
  onDone: (result: RagChatResponse) => void,
  onError?: (message: string) => void
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
    throw new Error(errText);
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
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6).trim();
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
            throw new Error(parsed.message || '流式请求出错');
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

export default httpClient;

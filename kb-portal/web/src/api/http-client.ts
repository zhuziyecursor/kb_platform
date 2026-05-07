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
export const listDocs = (spaceId?: string): Promise<DocListResponse> => {
  return httpClient.get<DocListResponse>('/kb/v1/docs', { params: { spaceId } }).then(res => res.data);
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
}

export interface RagChatResponse {
  answer: string;
  citations: Citation[];
  traceId: string;
  reason?: 'NO_MATCH' | 'NO_PERMISSION' | 'LOW_CONFIDENCE';
  sessionId?: string;
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
}

/**
 * Send a RAG chat query to the retrieval pipeline
 */
export const ragChat = (request: RagChatRequest): Promise<RagChatResponse> => {
  return httpClient.post<RagChatResponse>('/rag/v1/chat', request).then(res => res.data);
};

export default httpClient;

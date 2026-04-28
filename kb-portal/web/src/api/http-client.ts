import axios from 'axios';

const httpClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8081',
  timeout: 10000,
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
  chunkConfig: {
    useSpaceConfig: boolean;
    chunkSize: number;
    overlapRatio: number;
    chunkMode: 'HEAD_FIRST' | 'TAIL_FIRST' | 'UNIFORM';
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
  return httpClient.post<VerifyUploadResponse>(`/kb/v1/docs/${docId}/verify-upload`, { version }).then(res => res.data);
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
 * List documents with optional space filter
 */
export const listDocs = (spaceId?: string): Promise<DocListResponse> => {
  return httpClient.get<DocListResponse>('/kb/v1/docs', { params: { spaceId } }).then(res => res.data);
};

export interface DocListResponse {
  docs: DocSummary[];
  total: number;
}

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

export default httpClient;

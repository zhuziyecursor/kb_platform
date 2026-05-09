import httpClient from './http-client';
import type {
  KnowledgeSpace,
  KnowledgeSpaceTreeNode,
  CreateSpaceRequest,
  UpdateSpaceRequest,
  SpaceAclEntry,
  SpaceAclResponse,
} from '@/types';

/**
 * 获取知识空间列表
 */
export async function listSpaces(): Promise<KnowledgeSpace[]> {
  const response = await httpClient.get<{ spaces: KnowledgeSpace[] }>('/kb/v1/spaces');
  return response.data.spaces;
}

/**
 * 获取知识空间树形结构
 */
export async function getSpaceTree(): Promise<KnowledgeSpaceTreeNode[]> {
  const response = await httpClient.get<KnowledgeSpaceTreeNode[]>('/kb/v1/spaces/tree');
  return response.data;
}

/**
 * 获取知识空间详情
 */
export async function getSpace(spaceId: string): Promise<KnowledgeSpace> {
  const response = await httpClient.get<KnowledgeSpace>(`/kb/v1/spaces/${spaceId}`);
  return response.data;
}

/**
 * 创建知识空间
 */
export async function createSpace(data: CreateSpaceRequest): Promise<KnowledgeSpace> {
  const response = await httpClient.post<KnowledgeSpace>('/kb/v1/spaces', data);
  return response.data;
}

/**
 * 更新知识空间
 */
export async function updateSpace(
  spaceId: string,
  data: UpdateSpaceRequest
): Promise<KnowledgeSpace> {
  const response = await httpClient.put<KnowledgeSpace>(`/kb/v1/spaces/${spaceId}`, data);
  return response.data;
}

/**
 * 删除知识空间（仅空空间可删除）
 */
export async function deleteSpace(spaceId: string): Promise<void> {
  await httpClient.delete(`/kb/v1/spaces/${spaceId}`);
}

/**
 * 获取空间内的文档列表
 */
export async function getSpaceDocs(spaceId: string): Promise<unknown[]> {
  const response = await httpClient.get<{ docs: unknown[] }>(`/kb/v1/spaces/${spaceId}/docs`);
  return response.data.docs;
}

// ============== Space ACL APIs ==============

/**
 * 获取所有知识空间的权限配置（用于权限绑定页面）
 */
export async function getAllSpaceAcl(): Promise<SpaceAclResponse[]> {
  const response = await httpClient.get<SpaceAclResponse[]>('/kb/v1/space-acl');
  return response.data;
}

/**
 * 获取指定知识空间的权限配置
 */
export async function getSpaceAcl(spaceId: string): Promise<SpaceAclEntry[]> {
  const response = await httpClient.get<SpaceAclEntry[]>(`/kb/v1/space-acl/${spaceId}`);
  return response.data;
}

/**
 * 更新知识空间权限配置（会级联更新该空间下所有文档的 doc_acl 表）
 */
export async function updateSpaceAcl(
  spaceId: string,
  permissions: SpaceAclEntry[]
): Promise<void> {
  await httpClient.put(`/kb/v1/space-acl/${spaceId}`, { permissions });
}

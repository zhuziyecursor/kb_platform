'use client';

import React from 'react';
import { Tree, Typography, Popconfirm, Tooltip, App } from 'antd';
import type { TreeDataNode } from 'antd';
import {
  FolderOutlined,
  FileTextOutlined,
  PlusOutlined,
  CloudUploadOutlined,
  EditOutlined,
  DeleteOutlined,
  CaretDownFilled,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { Button, Badge } from '@/components/ui';
import type { KnowledgeSpaceTreeNode } from '@/types';
import { deleteSpace } from '@/api/knowledge-space';

const { Text } = Typography;

const CHUNK_MODE_MAP: Record<string, string> = {
  HEAD_FIRST: '从前到后',
  TAIL_FIRST: '从后到前',
  UNIFORM: '均匀切分',
  SMART: '智能切分',
  SMART_LLM: '智能+LLM',
};

interface SpaceTreeDataNode extends TreeDataNode {
  spaceData: KnowledgeSpaceTreeNode;
}

function toTreeData(nodes: KnowledgeSpaceTreeNode[]): SpaceTreeDataNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title: node.name,
    spaceData: node,
    children: node.children && node.children.length > 0 ? toTreeData(node.children) : undefined,
    isLeaf: false,
  }));
}

interface SpaceTreeViewProps {
  treeData: KnowledgeSpaceTreeNode[];
  onRefresh: () => void;
}

export default function SpaceTreeView({ treeData, onRefresh }: SpaceTreeViewProps) {
  const { message: msg } = App.useApp();
  const router = useRouter();

  const handleDelete = async (space: KnowledgeSpaceTreeNode) => {
    try {
      await deleteSpace(space.id);
      msg.success(`知识空间「${space.name}」已删除`);
      onRefresh();
    } catch {
      msg.error('删除失败，请确保该空间及其子空间内没有文档');
    }
  };

  const handleUpload = (space: KnowledgeSpaceTreeNode) => {
    router.push(`/documents/upload?spaceId=${space.id}`);
  };

  const handleEdit = (space: KnowledgeSpaceTreeNode) => {
    router.push(`/spaces/${space.id}`);
  };

  const handleCreateChild = (parent: KnowledgeSpaceTreeNode) => {
    router.push(`/spaces/create?parentId=${parent.id}`);
  };

  const titleRender = (nodeData: TreeDataNode) => {
    const space = (nodeData as SpaceTreeDataNode).spaceData;
    if (!space) return null;

    const isDefault = space.id === 'DEFAULT';
    const indentWidth = Math.min(space.depth || 0, 8) * 12;

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '4px 0',
          paddingLeft: indentWidth,
        }}
      >
        {/* 左侧：图标 + 名称 + badge + 文档数 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: isDefault
                ? 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)'
                : 'linear-gradient(135deg, #475569 0%, #64748B 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FolderOutlined style={{ fontSize: 13, color: '#fff' }} />
          </div>
          <Text strong style={{ color: 'var(--color-foreground)', fontSize: 14 }}>
            {space.name}
          </Text>
          {isDefault && <Badge variant="secondary" size="sm">默认</Badge>}
          <Tooltip title={`切片模式: ${CHUNK_MODE_MAP[space.chunkMode] || space.chunkMode} | 段长: ${space.chunkSize}字符`}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              <FileTextOutlined style={{ marginRight: 2 }} />
              {space.docCount || 0}
            </Text>
          </Tooltip>
        </div>

        {/* 右侧：操作按钮 */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="新建子分类">
            <Button
              variant="ghost"
              size="icon"
              icon={<PlusOutlined style={{ fontSize: 12 }} />}
              onClick={() => handleCreateChild(space)}
            />
          </Tooltip>
          <Tooltip title="上传文档">
            <Button
              variant="ghost"
              size="icon"
              icon={<CloudUploadOutlined style={{ fontSize: 12 }} />}
              onClick={() => handleUpload(space)}
            />
          </Tooltip>
          <Tooltip title="编辑空间">
            <Button
              variant="ghost"
              size="icon"
              icon={<EditOutlined style={{ fontSize: 12 }} />}
              onClick={() => handleEdit(space)}
            />
          </Tooltip>
          {!isDefault && (
            <Popconfirm
              title="确认删除"
              description={space.children && space.children.length > 0
                ? `「${space.name}」下还有 ${space.children.length} 个子分类，将一并删除`
                : `确定要删除「${space.name}」吗？`}
              onConfirm={() => handleDelete(space)}
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="删除空间">
                <Button
                  variant="ghost"
                  size="icon"
                  icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                  danger
                />
              </Tooltip>
            </Popconfirm>
          )}
        </div>
      </div>
    );
  };

  if (!treeData || treeData.length === 0) {
    return null;
  }

  return (
    <Tree
      treeData={toTreeData(treeData)}
      titleRender={titleRender}
      defaultExpandAll
      blockNode
      showIcon={false}
      switcherIcon={<CaretDownFilled style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }} />}
      style={{
        background: 'transparent',
      }}
    />
  );
}

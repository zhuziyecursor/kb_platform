'use client';

import React, { useState } from 'react';
import { Typography, Popconfirm, Tooltip, App, Tag, Skeleton } from 'antd';
import {
  FolderOutlined,
  PlusOutlined,
  CloudUploadOutlined,
  EditOutlined,
  DeleteOutlined,
  RightOutlined,
  DownOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
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

interface SpaceTreeViewProps {
  treeData: KnowledgeSpaceTreeNode[];
  onRefresh: () => void;
  loading?: boolean;
}

interface SpaceCardProps {
  space: KnowledgeSpaceTreeNode;
  depth: number;
  onRefresh: () => void;
}

function SpaceCard({ space, depth, onRefresh }: SpaceCardProps) {
  const { message: msg } = App.useApp();
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);

  const isDefault = space.id === 'DEFAULT';
  const hasChildren = space.children && space.children.length > 0;

  const handleDelete = async () => {
    try {
      await deleteSpace(space.id);
      msg.success(`知识空间「${space.name}」已删除`);
      onRefresh();
    } catch {
      msg.error('删除失败，请确保该空间及其子空间内没有文档');
    }
  };

  const handleUpload = () => {
    router.push(`/documents/upload?spaceId=${space.id}`);
  };

  const handleEdit = () => {
    router.push(`/spaces/${space.id}`);
  };

  const handleCreateChild = () => {
    router.push(`/spaces/create?parentId=${space.id}`);
  };

  const handleClick = () => {
    router.push(`/documents/list?spaceId=${space.id}`);
  };

  return (
    <div className="space-card-wrapper" style={{ paddingLeft: depth * 24 }}>
      <div
        className={`space-card ${isDefault ? 'space-card--default' : ''}`}
        onClick={handleClick}
      >
        {/* 展开/收起按钮 */}
        {hasChildren ? (
          <div
            className="space-card__expand"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <DownOutlined style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }} />
            ) : (
              <RightOutlined style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }} />
            )}
          </div>
        ) : (
          <div className="space-card__expand-placeholder" />
        )}

        {/* 图标 */}
        <div className={`space-card__icon ${isDefault ? 'space-card__icon--default' : ''}`}>
          <FolderOutlined style={{ fontSize: 15, color: 'currentColor' }} />
        </div>

        {/* 内容 */}
        <div className="space-card__content">
          <div className="space-card__top">
            <div className="space-card__name-row">
              <Text strong className="space-card__name">
                {space.name}
              </Text>
              {isDefault && (
                <Tag className="space-card__badge" style={{ margin: 0, fontSize: 10, padding: '0 6px', lineHeight: '18px', height: 20 }}>
                  默认
                </Tag>
              )}
              {space.smartParseEnabled && (
                <Tooltip title="智能解析已开启">
                  <span className="space-card__smart">
                    <ThunderboltOutlined style={{ fontSize: 10 }} />
                  </span>
                </Tooltip>
              )}
            </div>

            {/* 操作按钮 — 常驻显示 */}
            <div className="space-card__actions">
              <Tooltip title="新建子分类">
                <button
                  className="space-card__action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateChild();
                  }}
                >
                  <PlusOutlined style={{ fontSize: 12 }} />
                </button>
              </Tooltip>
              <Tooltip title="上传文档">
                <button
                  className="space-card__action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpload();
                  }}
                >
                  <CloudUploadOutlined style={{ fontSize: 12 }} />
                </button>
              </Tooltip>
              <Tooltip title="编辑空间">
                <button
                  className="space-card__action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit();
                  }}
                >
                  <EditOutlined style={{ fontSize: 12 }} />
                </button>
              </Tooltip>
              {!isDefault && (
                <Popconfirm
                  title="确认删除"
                  description={
                    space.children && space.children.length > 0
                      ? `「${space.name}」下还有 ${space.children.length} 个子分类，将一并删除`
                      : `确定要删除「${space.name}」吗？`
                  }
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    handleDelete();
                  }}
                  okText="确认删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Tooltip title="删除空间">
                    <button
                      className="space-card__action-btn space-card__action-btn--danger"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DeleteOutlined style={{ fontSize: 12 }} />
                    </button>
                  </Tooltip>
                </Popconfirm>
              )}
            </div>
          </div>

          <div className="space-card__bottom">
            {space.description && (
              <Text type="secondary" className="space-card__desc">
                {space.description}
              </Text>
            )}
            <div className="space-card__meta">
              <span className="space-card__meta-item">
                <FileTextOutlined style={{ fontSize: 10, marginRight: 3 }} />
                {space.docCount || 0} 文档
              </span>
              <span className="space-card__meta-divider" />
              <span className="space-card__meta-item">
                {CHUNK_MODE_MAP[space.chunkMode] || space.chunkMode}
              </span>
              <span className="space-card__meta-divider" />
              <span className="space-card__meta-item">
                {space.chunkSize} 字符
              </span>
              <span className="space-card__meta-divider" />
              <span className="space-card__meta-item">
                {space.visibility === 'PUBLIC' ? '公开' : '团队'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 子空间 */}
      {hasChildren && expanded && (
        <div className="space-card__children">
          {space.children!.map((child) => (
            <SpaceCard key={child.id} space={child} depth={depth + 1} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SpaceTreeView({ treeData, onRefresh, loading }: SpaceTreeViewProps) {
  if (loading) {
    return (
      <div className="space-tree-v2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-card-wrapper" style={{ paddingLeft: i < 2 ? 0 : 24 }}>
            <div className="space-card" style={{ padding: '16px 20px' }}>
              <Skeleton active avatar={{ size: 40, shape: 'square' }} paragraph={{ rows: 1 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!treeData || treeData.length === 0) {
    return null;
  }

  return (
    <div className="space-tree-v2">
      {treeData.map((node) => (
        <SpaceCard key={node.id} space={node} depth={0} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

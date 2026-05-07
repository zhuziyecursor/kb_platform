'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Tag, Space, Typography, Badge, Popconfirm, Progress, Empty, Tooltip } from 'antd';
import { App } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  SettingOutlined,
  RightOutlined,
  LockOutlined,
  TeamOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import type { KnowledgeSpace } from '@/types';
import { listSpaces, deleteSpace } from '@/api/knowledge-space';

const { Text } = Typography;

const CHUNK_MODE_MAP: Record<string, { label: string; color: string }> = {
  HEAD_FIRST: { label: '从前到后', color: 'blue' },
  TAIL_FIRST: { label: '从后到前', color: 'cyan' },
  UNIFORM: { label: '均匀切分', color: 'purple' },
  SMART: { label: '智能切分', color: 'geekblue' },
  SMART_LLM: { label: '智能+LLM', color: 'volcano' },
};

const VISIBILITY_ICON = {
  PUBLIC: <GlobalOutlined />,
  TEAM: <TeamOutlined />,
  PRIVATE: <LockOutlined />,
};

const VISIBILITY_COLOR = {
  PUBLIC: '#15803D',
  TEAM: '#1D4ED8',
  PRIVATE: '#7C3AED',
};

interface SpaceCardProps {
  space: KnowledgeSpace;
  onDelete: (space: KnowledgeSpace) => void;
  onEdit: (space: KnowledgeSpace) => void;
  onUpload: (space: KnowledgeSpace) => void;
}

function SpaceCard({ space, onDelete, onEdit, onUpload }: SpaceCardProps) {
  const router = useRouter();
  const isDefault = space.id === 'DEFAULT';
  const docCount = space.docCount || 0;

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: '20px 22px',
        transition: 'all 0.2s ease',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(37,99,235,0.3)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(37,99,235,0.08)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'none';
      }}
    >
      {/* Top: Icon + Name + Visibility */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Space Icon */}
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: isDefault
              ? 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)'
              : 'linear-gradient(135deg, #475569 0%, #64748B 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: isDefault
              ? '0 4px 12px rgba(37,99,235,0.25)'
              : '0 4px 12px rgba(71,85,105,0.2)',
          }}>
            <FolderOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>
                {space.name}
              </Text>
              {isDefault && (
                <Tag style={{
                  background: 'rgba(37,99,235,0.08)',
                  border: '1px solid rgba(37,99,235,0.15)',
                  color: '#2563EB',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '0 4px',
                }}>
                  默认
                </Tag>
              )}
            </div>
            {space.description && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                {space.description}
              </Text>
            )}
          </div>
        </div>

        {/* Visibility */}
        {space.visibility && (
          <Tooltip title={space.visibility === 'PUBLIC' ? '公开' : space.visibility === 'TEAM' ? '团队内' : '私有'}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: `${VISIBILITY_COLOR[space.visibility as keyof typeof VISIBILITY_COLOR]}14`,
              border: `1px solid ${VISIBILITY_COLOR[space.visibility as keyof typeof VISIBILITY_COLOR]}28`,
              borderRadius: 6,
              padding: '3px 8px',
              color: VISIBILITY_COLOR[space.visibility as keyof typeof VISIBILITY_COLOR] || '#64748B',
              fontSize: 11,
              fontWeight: 500,
              flexShrink: 0,
            }}>
              {VISIBILITY_ICON[space.visibility as keyof typeof VISIBILITY_ICON]}
              <span>{space.visibility === 'PUBLIC' ? '公开' : space.visibility === 'TEAM' ? '团队' : '私有'}</span>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        marginBottom: 14,
        background: 'var(--color-muted)',
        borderRadius: 10,
        padding: '12px 14px',
      }}>
        {/* Doc Count */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <FileTextOutlined style={{ fontSize: 11, color: 'var(--color-accent)' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>文档数量</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <Text strong style={{ fontSize: 22, color: 'var(--color-foreground)', lineHeight: 1 }}>
              {docCount}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>篇</Text>
          </div>
        </div>

        {/* Chunk Config */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <SettingOutlined style={{ fontSize: 11, color: 'var(--color-accent)' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>切片模式</Text>
          </div>
          <Tag
            color={CHUNK_MODE_MAP[space.chunkMode]?.color || 'default'}
            style={{ borderRadius: 4, fontSize: 11, margin: 0 }}
          >
            {CHUNK_MODE_MAP[space.chunkMode]?.label || space.chunkMode}
          </Tag>
        </div>

        {/* Chunk Size */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <DatabaseOutlined style={{ fontSize: 11, color: 'var(--color-accent)' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>段落长度</Text>
          </div>
          <Text strong style={{ fontSize: 13, color: 'var(--color-foreground)' }}>
            {space.chunkSize}
            <Text type="secondary" style={{ fontSize: 11 }}> 字符</Text>
          </Text>
        </div>

        {/* Overlap */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--color-accent)' }}>↕</span>
            <Text type="secondary" style={{ fontSize: 11 }}>重叠率</Text>
          </div>
          <Progress
            percent={space.overlapRatio || 0}
            size="small"
            showInfo={false}
            strokeColor="#3B82F6"
            trailColor="rgba(0,0,0,0.06)"
            style={{ marginTop: 2 }}
          />
          <Text type="secondary" style={{ fontSize: 10 }}>{space.overlapRatio}%</Text>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid var(--color-border)',
        paddingTop: 12,
      }}>
        <Button
          type="link"
          icon={<RightOutlined style={{ fontSize: 10 }} />}
          onClick={() => router.push(`/documents/list?spaceId=${space.id}`)}
          style={{
            fontSize: 12,
            color: 'var(--color-accent)',
            padding: '2px 0',
            height: 'auto',
          }}
        >
          查看文档
        </Button>
        <Space size={4}>
          <Tooltip title="上传文档">
            <Button
              type="text"
              size="small"
              icon={<CloudUploadOutlined style={{ fontSize: 13 }} />}
              onClick={() => onUpload(space)}
              style={{ color: 'var(--color-secondary)' }}
            />
          </Tooltip>
          <Tooltip title="编辑空间">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ fontSize: 13 }} />}
              onClick={() => onEdit(space)}
              style={{ color: 'var(--color-secondary)' }}
            />
          </Tooltip>
          {!isDefault && (
            <Popconfirm
              title="确认删除"
              description={`删除后无法恢复，空间内的文档将移至默认空间。`}
              onConfirm={() => onDelete(space)}
              okText="确认删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="删除空间">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      </div>
    </div>
  );
}

export default function SpaceListPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSpaces = async () => {
    setLoading(true);
    try {
      const data = await listSpaces();
      setSpaces(data);
    } catch {
      message.error('加载知识空间失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpaces();
  }, []);

  const handleDelete = async (space: KnowledgeSpace) => {
    try {
      await deleteSpace(space.id);
      message.success(`知识空间「${space.name}」已删除`);
      fetchSpaces();
    } catch {
      message.error('删除失败，请确保空间内没有文档');
    }
  };

  const handleUpload = (space: KnowledgeSpace) => {
    router.push(`/documents/upload?spaceId=${space.id}`);
  };

  const handleEdit = (space: KnowledgeSpace) => {
    router.push(`/spaces/${space.id}`);
  };

  // Stats
  const totalDocs = spaces.reduce((sum, s) => sum + (s.docCount || 0), 0);
  const totalSpaces = spaces.length;

  return (
    <AppLayout>
      <PageHeader
        breadcrumbs={[
          { title: '知识库' },
          { title: '知识空间' },
        ]}
        title="知识空间"
        description="管理不同的知识库分区，每个空间可独立配置切片规则和访问权限"
        actions={
          <>
            <Button
              icon={<CloudUploadOutlined />}
              onClick={() => router.push('/documents/upload')}
            >
              上传文档
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/spaces/create')}
            >
              新建空间
            </Button>
          </>
        }
      />

      {/* Stats Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 24,
      }}>
        {[
          {
            label: '知识空间',
            value: totalSpaces,
            icon: <FolderOutlined />,
            color: '#3B82F6',
            bg: 'rgba(59,130,246,0.08)',
            border: 'rgba(59,130,246,0.15)',
          },
          {
            label: '文档总数',
            value: totalDocs,
            icon: <FileTextOutlined />,
            color: '#15803D',
            bg: 'rgba(21,128,61,0.08)',
            border: 'rgba(21,128,61,0.15)',
          },
          {
            label: '智能切片空间',
            value: spaces.filter(s => s.chunkMode === 'SMART' || s.chunkMode === 'SMART_LLM').length,
            icon: <SettingOutlined />,
            color: '#7C3AED',
            bg: 'rgba(124,58,237,0.08)',
            border: 'rgba(124,58,237,0.15)',
          },
        ].map((stat, i) => (
          <Card
            key={i}
            size="small"
            style={{
              borderRadius: 12,
              border: `1px solid ${stat.border}`,
              background: stat.bg,
            }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: stat.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                opacity: 0.9,
              }}>
                <span style={{ fontSize: 18, color: '#fff' }}>{stat.icon}</span>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{stat.label}</Text>
                <Text strong style={{ fontSize: 24, color: 'var(--color-foreground)', lineHeight: 1.2 }}>
                  {stat.value}
                </Text>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Space Grid */}
      {spaces.length === 0 && !loading ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无知识空间"
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/spaces/create')}>
            新建空间
          </Button>
        </Empty>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}>
          {spaces.map((space) => (
            <SpaceCard
              key={space.id}
              space={space}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onUpload={handleUpload}
            />
          ))}
        </div>
      )}
    </AppLayout>
  );
}

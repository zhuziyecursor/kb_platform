'use client';

import React, { useState, useEffect } from 'react';
import { Card, Typography, Empty } from 'antd';
import { Button } from '@/components/ui';
import { App } from 'antd';
import {
  PlusOutlined,
  CloudUploadOutlined,
  FolderOutlined,
  FileTextOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import type { KnowledgeSpaceTreeNode } from '@/types';
import { getSpaceTree } from '@/api/knowledge-space';
import SpaceTreeView from '@/components/SpaceTreeView';

const { Text } = Typography;

function countDocs(node: KnowledgeSpaceTreeNode): number {
  let total = node.docCount || 0;
  if (node.children) {
    for (const child of node.children) {
      total += countDocs(child);
    }
  }
  return total;
}

function countAllSpaces(nodes: KnowledgeSpaceTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + (node.children ? countAllSpaces(node.children) : 0);
  }
  return total;
}

export default function SpaceListPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [treeData, setTreeData] = useState<KnowledgeSpaceTreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTree = async () => {
    setLoading(true);
    try {
      const data = await getSpaceTree();
      setTreeData(data);
    } catch {
      message.error('加载知识空间失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, []);

  const totalDocs = treeData.reduce((sum, node) => sum + countDocs(node), 0);
  const totalSpaces = countAllSpaces(treeData);

  return (
    <AppLayout>
      <PageHeader
        breadcrumbs={[
          { title: '知识库' },
          { title: '知识空间' },
        ]}
        title="知识空间"
        description="管理不同的知识库分区，支持多层分类和独立切片规则"
        actions={
          <>
            <Button
              icon={<CloudUploadOutlined />}
              onClick={() => router.push('/documents/upload')}
            >
              上传文档
            </Button>
            <Button
              variant="primary"
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
            value: totalSpaces, // simplified
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

      {/* Space Tree */}
      {treeData.length === 0 && !loading ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无知识空间"
          >
            <Button variant="primary" icon={<PlusOutlined />} onClick={() => router.push('/spaces/create')}>
              新建空间
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card
          style={{ borderRadius: 12, overflow: 'hidden' }}
          loading={loading}
        >
          <SpaceTreeView treeData={treeData} onRefresh={fetchTree} />
        </Card>
      )}
    </AppLayout>
  );
}

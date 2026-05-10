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
  WarningOutlined,
  ClockCircleOutlined,
  FileMarkdownOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import type { KnowledgeSpaceTreeNode } from '@/types';
import { getSpaceTree } from '@/api/knowledge-space';
import { getStatsOverview, StatsOverviewResponse } from '@/api/http-client';
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
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<StatsOverviewResponse | null>(null);

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

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const data = await getStatsOverview();
      setStats(data);
    } catch {
      // stats is optional, don't block UI
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
    fetchStats();
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
              icon={<FileMarkdownOutlined />}
              onClick={() => router.push('/spaces/import')}
            >
              从大纲导入
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

      {/* Stats Overview Cards */}
      <div className="stat-grid">
        <div className="stat-card-v2 stat-card-v2--blue">
          <div className="stat-card-v2__icon">
            <FolderOutlined />
          </div>
          <div className="stat-card-v2__content">
            <div className="stat-card-v2__label">知识空间</div>
            <div className="stat-card-v2__number">{totalSpaces}</div>
            <div className="stat-card-v2__trend stat-card-v2__trend--up">
              <ArrowUpOutlined style={{ fontSize: 10 }} />
              <span>活跃</span>
            </div>
          </div>
        </div>

        <div className="stat-card-v2 stat-card-v2--green">
          <div className="stat-card-v2__icon">
            <FileTextOutlined />
          </div>
          <div className="stat-card-v2__content">
            <div className="stat-card-v2__label">文档总数</div>
            <div className="stat-card-v2__number">{totalDocs}</div>
            <div className="stat-card-v2__trend stat-card-v2__trend--up">
              <ArrowUpOutlined style={{ fontSize: 10 }} />
              <span>持续增长</span>
            </div>
          </div>
        </div>

        <div className="stat-card-v2 stat-card-v2--amber">
          <div className="stat-card-v2__icon">
            <ClockCircleOutlined />
          </div>
          <div className="stat-card-v2__content">
            <div className="stat-card-v2__label">待处理</div>
            <div className="stat-card-v2__number">{stats?.pendingCount ?? 0}</div>
            <div className="stat-card-v2__trend stat-card-v2__trend--neutral">
              <span>队列中</span>
            </div>
          </div>
        </div>

        <div className={`stat-card-v2 ${(stats?.failedCount ?? 0) > 0 ? 'stat-card-v2--red' : 'stat-card-v2--gray'}`}>
          <div className="stat-card-v2__icon">
            <WarningOutlined />
          </div>
          <div className="stat-card-v2__content">
            <div className="stat-card-v2__label">处理失败</div>
            <div className="stat-card-v2__number">{stats?.failedCount ?? 0}</div>
            <div className={`stat-card-v2__trend ${(stats?.failedCount ?? 0) > 0 ? 'stat-card-v2__trend--down' : 'stat-card-v2__trend--up'}`}>
              {(stats?.failedCount ?? 0) > 0 ? (
                <>
                  <ArrowDownOutlined style={{ fontSize: 10 }} />
                  <span>需关注</span>
                </>
              ) : (
                <>
                  <ArrowUpOutlined style={{ fontSize: 10 }} />
                  <span>一切正常</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Space Tree */}
      {treeData.length === 0 && !loading ? (
        <div className="space-section">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无知识空间"
          >
            <Button variant="primary" icon={<PlusOutlined />} onClick={() => router.push('/spaces/create')}>
              新建空间
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="space-section">
          <div className="space-section__header">
            <Text strong style={{ fontSize: 14, color: 'var(--color-foreground)' }}>空间目录</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>共 {totalSpaces} 个空间，{totalDocs} 份文档</Text>
          </div>
          <SpaceTreeView treeData={treeData} onRefresh={fetchTree} loading={loading} />
        </div>
      )}
    </AppLayout>
  );
}

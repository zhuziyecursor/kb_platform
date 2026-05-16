'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Empty, Input, Select, Space, Spin, Typography, App } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import DatasetCard from '@/components/eval/DatasetCard';
import { useUserContext } from '@/hooks/useUserContext';
import { listDatasets, deleteDataset } from '@/api/http-client';
import type { EvalDatasetItem } from '@/api/http-client';

const { Title, Text } = Typography;

export default function DatasetsPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const { tenantId } = useUserContext();
  const [loading, setLoading] = useState(true);
  const [datasets, setDatasets] = useState<EvalDatasetItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDatasets(tenantId, 0, 100);
      setDatasets(res.items || []);
    } catch {
      message.error('加载数据集列表失败');
    } finally {
      setLoading(false);
    }
  }, [tenantId, message]);

  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  const handleDelete = (id: string) => {
    modal.confirm({
      title: '确认删除',
      content: '删除后数据集及所有QA对将被永久移除。',
      okText: '确认删除',
      okType: 'danger',
      onOk: async () => {
        await deleteDataset(id);
        message.success('已删除');
        fetchDatasets();
      },
    });
  };

  const filtered = datasets.filter((ds) => {
    const matchSearch = !searchText || ds.name.toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = !statusFilter || ds.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <AppLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>数据测评</Title>
          <Text type="secondary">管理评测数据集，生成QA对并运行RAG准确度评测</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/evaluation/datasets/create')}>
          创建数据集
        </Button>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 18 }}>
        <Space wrap>
          <Input
            placeholder="搜索数据集..."
            prefix={<SearchOutlined />}
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v || '')}
            options={[
              { label: '草稿', value: 'DRAFT' },
              { label: '生成中', value: 'GENERATING' },
              { label: '已完成', value: 'COMPLETED' },
              { label: '失败', value: 'FAILED' },
            ]}
            style={{ width: 140 }}
          />
        </Space>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : filtered.length === 0 ? (
        <Empty description="暂无数据集" style={{ marginTop: 80 }}>
          <Button type="primary" onClick={() => router.push('/evaluation/datasets/create')}>创建第一个数据集</Button>
        </Empty>
      ) : (
        filtered.map((ds) => (
          <DatasetCard
            key={ds.datasetId}
            dataset={ds}
            onView={(id) => router.push(`/evaluation/datasets/${id}`)}
            onDelete={handleDelete}
          />
        ))
      )}
    </AppLayout>
  );
}

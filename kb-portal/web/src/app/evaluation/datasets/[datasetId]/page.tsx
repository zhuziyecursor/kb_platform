'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Tag, Descriptions, Segmented, Space, Button, App, Empty, Spin } from 'antd';
import {
  ArrowLeftOutlined,
  ThunderboltOutlined,
  ExportOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import QaPairTable from '@/components/eval/QaPairTable';
import EvalMetricsDashboard from '@/components/eval/EvalMetricsDashboard';
import CreateEvalRunModal from '@/components/eval/CreateEvalRunModal';
import {
  getDataset,
  listQaPairs,
  deleteDataset,
  listEvalRuns,
  getEvalRun,
  createEvalRun,
  executeEvalRun,
} from '@/api/http-client';
import type { EvalDatasetItem, EvalQaPairItem, StageEvent, EvalRunItem } from '@/api/http-client';

export default function DatasetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const datasetId = params.datasetId as string;
  const { message, modal } = App.useApp();

  const [dataset, setDataset] = useState<EvalDatasetItem | null>(null);
  const [tab, setTab] = useState<string>('qa');
  const [qaLoading, setQaLoading] = useState(true);
  const [qaPairs, setQaPairs] = useState<EvalQaPairItem[]>([]);
  const [qaTotal, setQaTotal] = useState(0);
  const [qaPage, setQaPage] = useState(0);
  const [qaType, setQaType] = useState<string | undefined>();
  const [qaDifficulty, setQaDifficulty] = useState<string | undefined>();
  const [runs, setRuns] = useState<EvalRunItem[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [evalRunning, setEvalRunning] = useState(false);
  const [evalStages, setEvalStages] = useState<StageEvent[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const fetchDataset = useCallback(async () => {
    try {
      const ds = await getDataset(datasetId);
      setDataset(ds);
    } catch {
      message.error('加载数据集失败');
    }
  }, [datasetId, message]);

  const fetchQaPairs = useCallback(async (page = 0) => {
    setQaLoading(true);
    try {
      const res = await listQaPairs(datasetId, qaType, qaDifficulty, page);
      setQaPairs(res.items || []);
      setQaTotal(res.total || 0);
      setQaPage(page);
    } catch {
      message.error('加载QA对失败');
    } finally {
      setQaLoading(false);
    }
  }, [datasetId, qaType, qaDifficulty, message]);

  const fetchRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await listEvalRuns(datasetId);
      setRuns(data || []);
    } catch {} finally {
      setRunsLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    fetchDataset();
    fetchQaPairs();
    fetchRuns();
  }, [fetchDataset, fetchQaPairs, fetchRuns]);

  // Poll for generating status
  useEffect(() => {
    if (!dataset || dataset.status !== 'GENERATING') return;
    const timer = setInterval(fetchDataset, 3000);
    return () => clearInterval(timer);
  }, [dataset, fetchDataset]);

  const handleDelete = () => {
    modal.confirm({
      title: '确认删除',
      content: '删除后数据集及所有QA对将被永久移除。',
      okText: '确认删除',
      okType: 'danger',
      onOk: async () => {
        await deleteDataset(datasetId);
        message.success('已删除');
        router.push('/evaluation/datasets');
      },
    });
  };

  const handleStartEval = async (config: { spaceId?: string; topK?: number; rerankEnabled?: boolean }) => {
    setEvalModalOpen(false);
    try {
      const run = await createEvalRun({ datasetId, config: config as Record<string, unknown> });
      setActiveRunId(run.runId);
      setEvalRunning(true);
      setEvalStages([]);

      executeEvalRun(
        run.runId,
        (stage) => setEvalStages(prev => [...prev, stage]),
        (result) => {
          message.success(`评测完成！精确匹配率: ${(((result.metrics as Record<string, number>).exactMatchRate || 0) * 100).toFixed(1)}%`);
          setEvalRunning(false);
          fetchRuns();
        },
        (err) => {
          message.error(`评测失败: ${err}`);
          setEvalRunning(false);
        }
      );
    } catch {
      message.error('启动评测失败');
    }
  };

  if (!dataset) {
    return (
      <AppLayout>
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      </AppLayout>
    );
  }

  const statusConfig: Record<string, { color: string; label: string }> = {
    DRAFT: { color: 'default', label: '草稿' },
    GENERATING: { color: 'processing', label: '生成中' },
    COMPLETED: { color: 'success', label: '已完成' },
    FAILED: { color: 'error', label: '失败' },
  };
  const status = statusConfig[dataset.status] || { color: 'default', label: dataset.status };

  return (
    <AppLayout>
      <PageHeader
        title={dataset.name}
        description={dataset.description || ''}
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/evaluation/datasets')}>返回</Button>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={4}>
          <Descriptions.Item label="状态">
            <Tag color={status.color}>{status.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="来源">{dataset.sourceType}</Descriptions.Item>
          <Descriptions.Item label="文件数">{dataset.fileCount}</Descriptions.Item>
          <Descriptions.Item label="分块数">{dataset.totalChunks}</Descriptions.Item>
          <Descriptions.Item label="QA 对数">{dataset.totalQaPairs}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(dataset.createdAt).toLocaleString()}</Descriptions.Item>
        </Descriptions>

        <Space style={{ marginTop: 8 }}>
          {dataset.status === 'DRAFT' && (
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => router.push(`/evaluation/datasets/${datasetId}/generate`)}
            >
              开始生成
            </Button>
          )}
          {dataset.status === 'COMPLETED' && (
            <Button
              icon={<ThunderboltOutlined />}
              onClick={() => setEvalModalOpen(true)}
            >
              运行评测
            </Button>
          )}
          <Button icon={<ExportOutlined />} disabled>导出 JSONL</Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>删除</Button>
        </Space>
      </Card>

      <Segmented
        value={tab}
        onChange={(v) => setTab(v as string)}
        options={[
          { value: 'qa', label: `QA 对 (${qaTotal})` },
          { value: 'runs', label: `评测历史 (${runs.length})` },
        ]}
        style={{ marginBottom: 16 }}
      />

      {tab === 'qa' ? (
        qaPairs.length === 0 && !qaLoading ? (
          <Card><Empty description="暂无QA对" /></Card>
        ) : (
          <Card>
            <Space style={{ marginBottom: 16 }}>
              <span>类型:</span>
              <Segmented
                value={qaType}
                onChange={(v) => setQaType(v as string || undefined)}
                options={[
                  { value: '', label: '全部' },
                  { value: 'FACTUAL', label: '事实型' },
                  { value: 'COMPARISON', label: '对比型' },
                  { value: 'MULTI_HOP', label: '多跳推理' },
                  { value: 'UNANSWERABLE', label: '不可回答' },
                ]}
              />
              <span style={{ marginLeft: 16 }}>难度:</span>
              <Segmented
                value={qaDifficulty}
                onChange={(v) => setQaDifficulty(v as string || undefined)}
                options={[
                  { value: '', label: '全部' },
                  { value: 'EASY', label: '简单' },
                  { value: 'MEDIUM', label: '中等' },
                  { value: 'HARD', label: '困难' },
                ]}
              />
            </Space>
            <QaPairTable
              dataSource={qaPairs}
              loading={qaLoading}
              pagination={{ current: qaPage + 1, pageSize: 50, total: qaTotal }}
              onPageChange={(page, size) => fetchQaPairs(page - 1)}
            />
          </Card>
        )
      ) : (
        <div>
          {evalRunning && activeRunId && (
            <div style={{ marginBottom: 16, padding: 16, background: '#e6f7ff', borderRadius: 8 }}>
              <Tag color="processing">评测运行中...</Tag>
              已评测 {evalStages.length * 10}+ 条
            </div>
          )}
          {runs.length === 0 ? (
            <Card><Empty description="暂无评测记录">
              <Button type="primary" onClick={() => setEvalModalOpen(true)}>新建评测</Button>
            </Empty></Card>
          ) : (
            runs.map(run => (
              <EvalMetricsDashboard key={run.runId} run={run} />
            ))
          )}
        </div>
      )}

      <CreateEvalRunModal
        open={evalModalOpen}
        datasetId={datasetId}
        spaceOptions={[]}
        onCancel={() => setEvalModalOpen(false)}
        onSubmit={handleStartEval}
      />
    </AppLayout>
  );
}

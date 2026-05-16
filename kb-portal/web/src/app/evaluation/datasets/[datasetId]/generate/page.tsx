'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, App, Spin, Typography, List, Tag, Space, Alert, Descriptions } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import GenerationProgress from '@/components/eval/GenerationProgress';
import { generateDataset, getDataset } from '@/api/http-client';
import type { StageEvent } from '@/api/http-client';

const { Text, Paragraph } = Typography;

export default function GeneratePage() {
  const router = useRouter();
  const params = useParams();
  const datasetId = params.datasetId as string;
  const { message } = App.useApp();

  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('');
  const [stats, setStats] = useState({
    completedQa: 0,
    totalQa: 5000,
    qaPerMin: 0,
    estimatedRemainingMs: 0,
  });
  const [datasetName, setDatasetName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [doneResult, setDoneResult] = useState<{ datasetId: string; totalQa: number; durationMs: number } | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    getDataset(datasetId).then(ds => setDatasetName(ds.name)).catch(() => {});
  }, [datasetId]);

  const handleStart = () => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    setGenerating(true);
    setError(null);

    generateDataset(
      datasetId,
      (stage: StageEvent) => {
        setStages(prev => {
          const existing = prev.findIndex(s => s.stage === stage.stage);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = stage;
            return updated;
          }
          return [...prev, stage];
        });
        setCurrentStage(stage.stage);

        if (stage.stage === 'PARSE_AND_CHUNK' && stage.summary) {
          const s = stage.summary as Record<string, unknown>;
          setStats({
            completedQa: (s.rawQaCount as number) || 0,
            totalQa: 5000,
            qaPerMin: 0,
            estimatedRemainingMs: 0,
          });
        }
      },
      (result) => {
        setDoneResult(result);
        setDone(true);
        setGenerating(false);
        message.success(`数据集生成完成！共 ${result.totalQa} 个QA对，耗时 ${(result.durationMs / 1000).toFixed(1)}s`);
      },
      (err) => {
        setError(err);
        setGenerating(false);
        message.error(`生成失败: ${err}`);
      }
    );
  };

  return (
    <AppLayout>
      <PageHeader
        title={`生成数据集: ${datasetName}`}
        description="实时观察数据集生成的完整 Pipeline 过程"
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(`/evaluation/datasets/${datasetId}`)}>
            返回详情
          </Button>
        }
      />

      {!generating && !done && (
        <Card style={{ maxWidth: 600, margin: '0 auto' }}>
          <Alert
            type="info"
            message="准备开始生成"
            description="点击下方按钮将启动完整的 Pipeline 流程：解析HTML → 文本分块 → LLM生成QA → 质量校验 → 存储结果。整个过程可能需要 30-60 分钟。"
            showIcon
            style={{ marginBottom: 24 }}
          />
          <Button
            type="primary"
            size="large"
            block
            onClick={handleStart}
          >
            开始生成
          </Button>
        </Card>
      )}

      {generating && (
        <div>
          <GenerationProgress
            stages={stages}
            currentStage={currentStage}
            stats={stats}
          />

          {stats.completedQa > 0 && (
            <Card title={`实时生成进度 (${stats.completedQa} / ${stats.totalQa})`}>
              <Text type="secondary">
                每个批次生成约 20 个 QA 对。完整数据集正在构建中...
              </Text>
            </Card>
          )}
        </div>
      )}

      {error && (
        <Card style={{ marginTop: 16, background: '#fff2f0' }}>
          <Space>
            <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
            <Text type="danger">{error}</Text>
          </Space>
          <br />
          <Button style={{ marginTop: 12 }} onClick={() => {
            hasStarted.current = false;
            setError(null);
            setStages([]);
            setCurrentStage('');
          }}>
            重试
          </Button>
        </Card>
      )}

      {done && doneResult && (
        <Card style={{ marginTop: 16, background: '#f6ffed' }}>
          <Space direction="vertical" size={8}>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />
              <Text strong style={{ fontSize: 18 }}>生成完成！</Text>
            </Space>
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="QA 总数">{doneResult.totalQa}</Descriptions.Item>
              <Descriptions.Item label="耗时">{(doneResult.durationMs / 1000).toFixed(1)}s</Descriptions.Item>
              <Descriptions.Item label="数据集ID">{doneResult.datasetId}</Descriptions.Item>
            </Descriptions>
            <Space style={{ marginTop: 8 }}>
              <Button type="primary" onClick={() => router.push(`/evaluation/datasets/${datasetId}`)}>
                查看数据集
              </Button>
              <Button onClick={() => router.push('/evaluation/datasets')}>
                返回列表
              </Button>
            </Space>
          </Space>
        </Card>
      )}
    </AppLayout>
  );
}

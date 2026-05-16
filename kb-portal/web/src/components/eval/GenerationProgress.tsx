'use client';

import React from 'react';
import { Steps, Card, Statistic, Row, Col, Tag } from 'antd';
import {
  CheckCircleOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { StageEvent } from '@/api/http-client';

const STAGES = [
  { key: 'DISCOVER_FILES', title: '扫描文件' },
  { key: 'PARSE_AND_CHUNK', title: '解析与生成QA' },
  { key: 'VALIDATE_QA', title: '质量校验' },
  { key: 'STORE_RESULTS', title: '存储结果' },
];

interface Props {
  stages: StageEvent[];
  currentStage?: string;
  stats?: {
    completedQa: number;
    totalQa: number;
    qaPerMin?: number;
    estimatedRemainingMs?: number;
  };
}

export default function GenerationProgress({ stages, currentStage, stats }: Props) {
  const completedStages = stages.filter(s => s.status === 'SUCCESS').map(s => s.stage);
  const failedStage = stages.find(s => s.status === 'ERROR');
  const activeStage = currentStage || stages.find(s => s.status !== 'SUCCESS')?.stage || STAGES[0].key;

  const stepItems = STAGES.map(({ key, title }) => {
    const stageResult = stages.find(s => s.stage === key);
    let status: 'wait' | 'process' | 'finish' | 'error' = 'wait';
    let icon = <ClockCircleOutlined />;

    if (completedStages.includes(key)) {
      status = 'finish';
      icon = <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    } else if (key === activeStage) {
      status = 'process';
      icon = <LoadingOutlined />;
    } else if (failedStage && failedStage.stage === key) {
      status = 'error';
      icon = <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    }

    const durationMs = stageResult?.durationMs;
    const description = durationMs
      ? `${(durationMs / 1000).toFixed(1)}s`
      : status === 'process' ? '进行中...' : '';

    return { title, status, icon, description };
  });

  return (
    <Card title="生成进度" style={{ marginBottom: 24 }}>
      <Steps
        direction="horizontal"
        size="small"
        current={STAGES.findIndex(s => s.key === activeStage)}
        status={failedStage ? 'error' : 'process'}
        items={stepItems}
        style={{ marginBottom: 24 }}
      />

      {stats && (
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="已生成 QA 对"
              value={stats.completedQa}
              suffix={`/ ${stats.totalQa}`}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="生成速度"
              value={stats.qaPerMin || '-'}
              suffix={stats.qaPerMin ? 'QA/min' : ''}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="预计剩余时间"
              value={
                stats.estimatedRemainingMs
                  ? `${Math.ceil(stats.estimatedRemainingMs / 60000)} 分钟`
                  : '-'
              }
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="当前阶段"
              value={activeStage ? STAGES.find(s => s.key === activeStage)?.title || activeStage : '-'}
              valueStyle={{ fontSize: 16 }}
            />
          </Col>
        </Row>
      )}

      {failedStage && (
        <Card size="small" style={{ marginTop: 16, background: '#fff2f0', border: '1px solid #ffccc7' }}>
          <Tag color="error">错误</Tag>
          {(failedStage.summary as Record<string, unknown>)?.error as string || '未知错误'}
        </Card>
      )}
    </Card>
  );
}

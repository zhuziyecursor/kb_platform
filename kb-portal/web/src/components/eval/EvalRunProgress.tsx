'use client';

import React from 'react';
import { Card, Progress, Row, Col, Statistic, Tag, Typography, Space } from 'antd';
import type { StageEvent } from '@/api/http-client';

const { Text } = Typography;

interface Props {
  stages: StageEvent[];
  progress?: { completedQa?: number; totalQa?: number };
}

export default function EvalRunProgress({ stages, progress }: Props) {
  const completed = progress?.completedQa || 0;
  const total = progress?.totalQa || 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card title="评测运行中" style={{ marginBottom: 24 }}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Statistic title="进度" value={`${completed} / ${total}`} />
        </Col>
        <Col span={8}>
          <Statistic title="完成率" value={percent} suffix="%" />
        </Col>
        <Col span={8}>
          <Statistic
            title="当前阶段"
            value={stages.length > 0 ? 'EVALUATE' : '准备中'}
          />
        </Col>
      </Row>
      <Progress percent={percent} status="active" />
    </Card>
  );
}

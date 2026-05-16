'use client';

import React from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ThunderboltOutlined,
  StarOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import type { EvalRunItem } from '@/api/http-client';

const { Text } = Typography;

interface Props {
  run: EvalRunItem;
}

export default function EvalMetricsDashboard({ run }: Props) {
  const metrics = run.metrics as Record<string, number> | undefined;

  if (!metrics) {
    return (
      <Card>
        <Text type="secondary">暂无评测指标数据</Text>
      </Card>
    );
  }

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="精确匹配率"
              value={metrics.exactMatchRate != null ? (metrics.exactMatchRate * 100).toFixed(1) : '-'}
              suffix="%"
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均延迟"
              value={metrics.avgLatencyMs || '-'}
              suffix="ms"
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="LLM Judge 均分"
              value={metrics.avgLlmJudgeScore != null ? (metrics.avgLlmJudgeScore).toFixed(1) : '-'}
              suffix="/ 5"
              prefix={<StarOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="平均引用数"
              value={metrics.avgCitationsCount || '-'}
              prefix={<LinkOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="运行信息">
        <Row gutter={16}>
          <Col span={8}>
            <Text type="secondary">评测 QA 总数</Text>
            <br />
            <Text strong>{metrics.totalQa || 0}</Text>
          </Col>
          <Col span={8}>
            <Text type="secondary">状态</Text>
            <br />
            <Tag color={run.status === 'COMPLETED' ? 'success' : run.status === 'FAILED' ? 'error' : 'processing'}>
              {run.status}
            </Tag>
          </Col>
          <Col span={8}>
            <Text type="secondary">开始时间</Text>
            <br />
            <Text>{run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}</Text>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

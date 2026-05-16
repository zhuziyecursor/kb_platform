'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Table,
  Tag,
  Spin,
  Segmented,
  Empty,
  Tooltip,
  App,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LikeOutlined,
  DislikeOutlined,
  FlagOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getDashboardMetrics, getErrorMessage } from '@/api/http-client';
import type { DashboardMetrics } from '@/api/http-client';
import { Button } from '@/components/ui';
import { useUserContext } from '@/hooks/useUserContext';

const { Text } = Typography;

interface Props {
  period: string;
  onPeriodChange: (p: string) => void;
}

export default function DashboardView({ period, onPeriodChange }: Props) {
  const { message } = App.useApp();
  const { tenantId } = useUserContext();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDashboardMetrics(tenantId, period, 10);
      setMetrics(data);
    } catch (err) {
      message.error(getErrorMessage(err, '加载仪表盘数据失败'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, period, message]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading && !metrics) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!metrics) {
    return <Empty description="暂无数据" />;
  }

  const refusalTrendData = metrics.refusalTrend.map((p) => ({
    label: p.label,
    拒答率: +(p.value * 100).toFixed(1),
    请求量: p.count,
  }));

  const requestTrendData = metrics.requestTrend.map((p) => ({
    label: p.label,
    平均响应ms: +p.value.toFixed(0),
    请求量: p.count,
  }));

  const slowQueryColumns = [
    {
      title: '查询',
      dataIndex: 'query',
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text style={{ fontSize: 13 }}>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: '平均耗时',
      dataIndex: 'avgMs',
      width: 100,
      sorter: (a: any, b: any) => a.avgMs - b.avgMs,
      render: (v: number) => <Text style={{ fontSize: 13 }}>{v.toFixed(0)}ms</Text>,
    },
    {
      title: 'P95',
      dataIndex: 'p95Ms',
      width: 100,
      render: (v: number) => <Text style={{ fontSize: 13 }}>{v.toFixed(0)}ms</Text>,
    },
    {
      title: '次数',
      dataIndex: 'count',
      width: 70,
      render: (v: number) => <Text style={{ fontSize: 13 }}>{v}</Text>,
    },
  ];

  return (
    <div>
      {/* Period Selector + Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Segmented
          value={period}
          onChange={(val) => onPeriodChange(val as string)}
          options={[
            { label: '今日', value: 'today' },
            { label: '近7天', value: '7days' },
            { label: '近30天', value: '30days' },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<ReloadOutlined />}
          onClick={fetchMetrics}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      {/* Metric Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="总请求量"
              value={metrics.totalRequests}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="成功率"
              value={metrics.successRate * 100}
              precision={1}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: metrics.successRate >= 0.9 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="平均响应"
              value={metrics.avgResponseMs}
              precision={0}
              suffix="ms"
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="拒答率"
              value={metrics.refusalRate * 100}
              precision={1}
              suffix="%"
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: metrics.refusalRate <= 0.15 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Feedback Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title="点赞"
              value={metrics.feedbackStats.likeCount}
              prefix={<LikeOutlined style={{ color: '#3f8600' }} />}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title="点踩"
              value={metrics.feedbackStats.dislikeCount}
              prefix={<DislikeOutlined style={{ color: '#cf1322' }} />}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title="报告"
              value={metrics.feedbackStats.reportCount}
              prefix={<FlagOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Trend Charts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={12}>
          <Card title="请求趋势" size="small">
            {requestTrendData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={requestTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip />
                  <Area
                    type="monotone"
                    dataKey="平均响应ms"
                    stroke="#1677ff"
                    fill="#1677ff20"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="拒答趋势" size="small">
            {refusalTrendData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={refusalTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <RechartsTooltip />
                  <Area
                    type="monotone"
                    dataKey="拒答率"
                    stroke="#faad14"
                    fill="#faad1420"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      {/* Slow Queries */}
      <Card title="慢查询 Top 10" size="small">
        <Table
          columns={slowQueryColumns}
          dataSource={metrics.topSlowQueries}
          rowKey={(r) => r.query}
          size="small"
          pagination={false}
          locale={{ emptyText: <Empty description="暂无慢查询" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>
    </div>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import {
  Card, Typography, Select, Progress, Table, Tag, App, Space, Tooltip, Skeleton,
} from 'antd';
import {
  FilterOutlined,
  DownloadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  AimOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  BarChartOutlined,
  MessageOutlined,
  LikeOutlined,
  DislikeOutlined,
  DatabaseOutlined,
  SyncOutlined,
  BranchesOutlined,
  BulbOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import AppLayout from '@/components/AppLayout';
import { Button, Badge } from '@/components/ui';
import { mockEvalMetrics, mockEvalReports, mockConversations } from '@/lib/eval-mock';
import type { EvalMetric, EvalReport } from '@/types';

const { Title, Text } = Typography;

const SPACE_OPTIONS = [
  { value: 'DEFAULT', label: '默认知识空间' },
  { value: 'ALL', label: '全部空间' },
];

const trendConfig: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  up: { icon: <RiseOutlined />, color: '#10B981', bg: '#ECFDF5', label: '上升' },
  down: { icon: <FallOutlined />, color: '#EF4444', bg: '#FEF2F2', label: '下降' },
  stable: { icon: <MinusOutlined />, color: '#F59E0B', bg: '#FFFBEB', label: '持平' },
};

function MetricCard({ metric }: { metric: EvalMetric }) {
  const trend = trendConfig[metric.trend];
  const isPercent = metric.unit === '%';

  return (
    <Card
      size="small"
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        transition: 'box-shadow 0.2s',
        cursor: 'default',
        height: '100%',
      }}
      styles={{ body: { padding: '16px 20px' } }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>{metric.name}</Text>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
            <Text strong style={{ fontSize: 24, color: 'var(--color-foreground)', lineHeight: 1 }}>
              {metric.value}{isPercent ? '%' : ''}
            </Text>
            {metric.target > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                / {metric.target}{isPercent ? '%' : ''}
              </Text>
            )}
          </div>
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: trend.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: trend.color, fontSize: 16,
        }}>
          {trend.icon}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        {metric.target > 0 && (
          <div style={{ flex: 1 }}>
            <Progress
              percent={Math.min((metric.value / metric.target) * 100, 100)}
              showInfo={false}
              strokeColor={metric.value >= metric.target ? '#10B981' : '#F59E0B'}
              size="small"
              style={{ margin: 0 }}
            />
          </div>
        )}
        <Text style={{ fontSize: 11, fontWeight: 500, color: trend.color }}>{trend.label}</Text>
      </div>
    </Card>
  );
}

const METRIC_COLORS: Record<string, string> = {
  'Recall@5': '#6366F1',
  'Recall@10': '#8B5CF6',
  MRR: '#06B6D4',
  'NDCG@10': '#10B981',
  Faithfulness: '#F59E0B',
  '引用接地率': '#EC4899',
};

const LOOP_STAGES = [
  { key: 'chat', label: '用户对话', icon: <MessageOutlined />, color: '#3B82F6', bg: '#EFF6FF', desc: '用户向智能体提问' },
  { key: 'feedback', label: '反馈收集', icon: <LikeOutlined />, color: '#10B981', bg: '#ECFDF5', desc: '用户对回答进行 👍/👎 评价' },
  { key: 'dataset', label: '评测数据集', icon: <DatabaseOutlined />, color: '#8B5CF6', bg: '#F5F3FF', desc: '反馈数据自动构建评测集' },
  { key: 'eval', label: '指标评测', icon: <BarChartOutlined />, color: '#F59E0B', bg: '#FFFBEB', desc: 'Recall / MRR / Faithfulness 计算' },
  { key: 'optimize', label: '系统优化', icon: <SyncOutlined />, color: '#06B6D4', bg: '#ECFEFF', desc: '根据指标调整检索/提示词策略' },
  { key: 'deploy', label: '策略上线', icon: <BranchesOutlined />, color: '#6366F1', bg: '#EEF2FF', desc: '优化后的策略部署到生产环境' },
];

export default function EvaluationPage() {
  const { message } = App.useApp();
  const [selectedSpace, setSelectedSpace] = useState('DEFAULT');

  const reports = useMemo(() =>
    mockEvalReports.filter((r) => r.spaceId === selectedSpace),
    [selectedSpace],
  );

  const totalFeedback = mockConversations.filter((c) => c.feedback).length;
  const thumbsUp = mockConversations.filter((c) => c.feedback === 'thumbs_up').length;
  const thumbsDown = mockConversations.filter((c) => c.feedback === 'thumbs_down').length;

  const chartData = useMemo(() =>
    reports.map((r) => ({
      name: r.datasetVersion,
      'Recall@5': +(r.recallAt5 * 100).toFixed(0),
      'Recall@10': +(r.recallAt10 * 100).toFixed(0),
      MRR: +(r.mrr * 100).toFixed(0),
      'NDCG@10': +(r.ndcg * 100).toFixed(0),
      Faithfulness: +(r.faithfulness * 100).toFixed(0),
      '引用接地率': +(r.groundingRate * 100).toFixed(0),
    })),
    [reports],
  );

  const radarData = useMemo(() =>
    mockEvalMetrics
      .filter((m) => m.name !== '👍 率' && m.name !== '👎 率')
      .map((m) => ({
        metric: m.name,
        当前值: m.value,
        目标值: m.target,
      })),
    [],
  );

  const latestReport = reports[reports.length - 1];
  const firstReport = reports[0];

  const improvements = useMemo(() => {
    if (!latestReport || !firstReport) return [];
    return [
      { label: 'Recall@5', before: firstReport.recallAt5, after: latestReport.recallAt5 },
      { label: 'Recall@10', before: firstReport.recallAt10, after: latestReport.recallAt10 },
      { label: 'MRR', before: firstReport.mrr, after: latestReport.mrr },
      { label: 'NDCG', before: firstReport.ndcg, after: latestReport.ndcg },
      { label: 'Faithfulness', before: firstReport.faithfulness, after: latestReport.faithfulness },
      { label: '引用接地率', before: firstReport.groundingRate, after: latestReport.groundingRate },
    ];
  }, [latestReport, firstReport]);

  const historyColumns = [
    { title: '评测版本', dataIndex: 'datasetVersion', key: 'datasetVersion', render: (v: string, _: any, idx: number) => (
      <Space size={4}>
        <Text strong style={{ fontSize: 13 }}>{v}</Text>
        {idx === reports.length - 1 && <Badge variant="default" size="sm">最新</Badge>}
        {idx === 0 && <Badge variant="outline" size="sm">基线</Badge>}
      </Space>
    )},
    { title: '评测时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text> },
    { title: 'Recall@5', dataIndex: 'recallAt5', key: 'recallAt5', render: (v: number) => <Text strong style={{ fontSize: 13 }}>{(v * 100).toFixed(0)}%</Text> },
    { title: 'Recall@10', dataIndex: 'recallAt10', key: 'recallAt10', render: (v: number) => <Text strong style={{ fontSize: 13 }}>{(v * 100).toFixed(0)}%</Text> },
    { title: 'MRR', dataIndex: 'mrr', key: 'mrr', render: (v: number) => <Text strong style={{ fontSize: 13 }}>{v.toFixed(2)}</Text> },
    { title: 'NDCG@10', dataIndex: 'ndcg', key: 'ndcg', render: (v: number) => <Text strong style={{ fontSize: 13 }}>{v.toFixed(2)}</Text> },
    { title: 'Faithfulness', dataIndex: 'faithfulness', key: 'faithfulness', render: (v: number) => <Text strong style={{ fontSize: 13 }}>{(v * 100).toFixed(0)}%</Text> },
    { title: '引用接地率', dataIndex: 'groundingRate', key: 'groundingRate', render: (v: number) => <Text strong style={{ fontSize: 13 }}>{(v * 100).toFixed(0)}%</Text> },
    { title: '综合评分', key: 'avg', render: (_: any, record: EvalReport) => {
      const avg = (record.recallAt5 + record.recallAt10 + record.mrr + record.ndcg + record.faithfulness + record.groundingRate) / 6;
      return (
        <Space size={8}>
          <Progress percent={avg * 100} showInfo={false} size="small" style={{ width: 64, margin: 0 }} />
          <Text strong style={{ fontSize: 12 }}>{(avg * 100).toFixed(0)}%</Text>
        </Space>
      );
    }},
  ];

  return (
    <AppLayout>
      <div style={{ maxWidth: 'var(--content-max-width)', margin: '0 auto' }}>
        {/* Hero Header */}
        <div className="hero-banner animate-fade-in" style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ flex: 1 }}>
            <Title level={2} style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }}>
              评测看板
            </Title>
            <Text type="secondary" style={{ fontSize: 14, marginTop: 6, display: 'block' }}>
              量化评估检索质量和回答准确性，持续追踪改进效果
            </Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FilterOutlined style={{ color: 'var(--color-secondary)', fontSize: 14 }} />
            <Select
              value={selectedSpace}
              onChange={setSelectedSpace}
              options={SPACE_OPTIONS}
              style={{ width: 180 }}
              size="small"
              variant="borderless"
            />
            <Button
              variant="outline"
              size="sm"
              icon={<DownloadOutlined style={{ fontSize: 12 }} />}
              onClick={() => message.success('报告导出功能即将上线')}
            >
              导出报告
            </Button>
          </div>
        </div>

        {/* Feedback Closed Loop */}
        <Card
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: 16,
          }}
          title={
            <Space>
              <BulbOutlined style={{ color: 'var(--color-accent)' }} />
              <Text strong style={{ fontSize: 14 }}>反馈闭环 — 从用户对话到系统优化</Text>
              <Badge variant="secondary" size="sm">持续迭代</Badge>
            </Space>
          }
          styles={{ body: { padding: '16px 20px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 20 }}>
            {LOOP_STAGES.map((stage, idx) => (
              <div key={stage.key} style={{ flex: 1, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    position: 'relative', zIndex: 10,
                    width: 40, height: 40, borderRadius: 12,
                    background: stage.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: stage.color, fontSize: 18,
                    border: '2px solid #fff',
                    boxShadow: 'var(--shadow-sm)',
                  }}>
                    {stage.icon}
                  </div>
                  <Text style={{ fontSize: 11, fontWeight: 500, marginTop: 6, textAlign: 'center', lineHeight: 1.3 }}>
                    {stage.label}
                  </Text>
                </div>
                {idx < LOOP_STAGES.length - 1 && (
                  <div style={{
                    position: 'absolute', top: 20, left: '60%', right: '-40%',
                    height: 2, background: 'var(--color-border)',
                  }}>
                    <div style={{ height: '100%', width: '50%', background: 'var(--color-accent)', opacity: 0.4, borderRadius: 2 }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
              <Space size={6}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageOutlined style={{ color: '#3B82F6', fontSize: 12 }} />
                </div>
                <Text style={{ fontSize: 12, fontWeight: 500 }}>用户对话</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 6, lineHeight: 1.5 }}>
                用户在对话界面提问，智能体基于知识库检索并生成带引用的回答。
              </Text>
            </div>

            <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
              <Space size={6}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LikeOutlined style={{ color: '#10B981', fontSize: 12 }} />
                </div>
                <Text style={{ fontSize: 12, fontWeight: 500 }}>反馈收集</Text>
              </Space>
              <Space size={12} style={{ marginTop: 6 }}>
                <Text style={{ color: '#10B981', fontSize: 12, fontWeight: 500 }}>👍 {thumbsUp}</Text>
                <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: 500 }}>👎 {thumbsDown}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>共 {totalFeedback} 条</Text>
              </Space>
              <Progress
                percent={totalFeedback > 0 ? Math.round((thumbsUp / totalFeedback) * 100) : 0}
                showInfo={false}
                size="small"
                style={{ marginTop: 6 }}
              />
              <Text type="secondary" style={{ fontSize: 10 }}>
                满意度 {totalFeedback > 0 ? Math.round((thumbsUp / totalFeedback) * 100) : 0}%
              </Text>
            </div>

            <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
              <Space size={6}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DatabaseOutlined style={{ color: '#8B5CF6', fontSize: 12 }} />
                </div>
                <Text style={{ fontSize: 12, fontWeight: 500 }}>评测数据集</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 6, lineHeight: 1.5 }}>
                标记为"有用"的问答对自动加入评测数据集，当前版本 <Text strong style={{ fontSize: 10 }}>{latestReport?.datasetVersion || '-'}</Text>。
              </Text>
              <Space size={4} style={{ marginTop: 4 }}>
                <Tag style={{ fontSize: 9, lineHeight: '16px', margin: 0 }}>自动构建</Tag>
                <Tag style={{ fontSize: 9, lineHeight: '16px', margin: 0 }}>人工审核</Tag>
              </Space>
            </div>

            <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
              <Space size={6}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChartOutlined style={{ color: '#F59E0B', fontSize: 12 }} />
                </div>
                <Text style={{ fontSize: 12, fontWeight: 500 }}>指标评测</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 6, lineHeight: 1.5 }}>
                在评测数据集上计算 Recall、MRR、Faithfulness 等指标，与目标值对比。
              </Text>
              <Text style={{ fontSize: 10, color: '#10B981', marginTop: 4, display: 'block' }}>
                ↑ {improvements.filter(i => i.after > i.before).length} 项提升
              </Text>
            </div>

            <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
              <Space size={6}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: '#ECFEFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SyncOutlined style={{ color: '#06B6D4', fontSize: 12 }} />
                </div>
                <Text style={{ fontSize: 12, fontWeight: 500 }}>系统优化</Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 6, lineHeight: 1.5 }}>
                根据评测结果调整切片策略、检索参数、重排序模型等，形成优化方案。
              </Text>
              <Space size={4} style={{ marginTop: 4 }}>
                <SyncOutlined style={{ fontSize: 10, color: '#06B6D4' }} />
                <Text style={{ fontSize: 10, color: '#06B6D4' }}>持续迭代闭环</Text>
              </Space>
            </div>
          </div>
        </Card>

        {/* Metric Cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
          marginBottom: 16,
        }}>
          {mockEvalMetrics.map((m) => (
            <MetricCard key={m.name} metric={m} />
          ))}
        </div>

        {/* Charts Row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16,
          marginBottom: 16,
        }}>
          {/* Line chart */}
          <Card
            title={
              <Space>
                <Text strong style={{ fontSize: 14 }}>指标变化趋势</Text>
                <Badge variant="secondary" size="sm">最近 {reports.length} 次评测</Badge>
              </Space>
            }
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
            styles={{ body: { padding: '8px 16px 16px' } }}
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis domain={[60, 100]} axisLine={false} tickLine={false} fontSize={12} tickFormatter={(v) => `${v}%`} />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-md)',
                    fontSize: 12,
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                {Object.keys(METRIC_COLORS).map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={METRIC_COLORS[key]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 1, fill: '#fff' }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Radar chart */}
          <Card
            title={
              <Space>
                <Text strong style={{ fontSize: 14 }}>当前 vs 目标</Text>
                <AimOutlined style={{ color: 'var(--color-secondary)' }} />
              </Space>
            }
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
            styles={{ body: { padding: '8px 16px 16px' } }}
          >
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="metric" fontSize={10} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-md)',
                    fontSize: 12,
                  }}
                />
                <Radar
                  name="当前值"
                  dataKey="当前值"
                  stroke="#6366F1"
                  fill="#6366F1"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Radar
                  name="目标值"
                  dataKey="目标值"
                  stroke="#94A3B8"
                  fill="#94A3B8"
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Improvement + Insights */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16,
          marginBottom: 16,
        }}>
          <Card
            title={
              <Space>
                <Text strong style={{ fontSize: 14 }}>指标提升明细</Text>
                <Badge variant="secondary" size="sm">
                  {firstReport?.datasetVersion} → {latestReport?.datasetVersion}
                </Badge>
              </Space>
            }
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
            styles={{ body: { padding: '12px 20px' } }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {improvements.map((item) => {
                const diff = item.after - item.before;
                const pct = (diff / (item.before || 0.01) * 100);
                return (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: 500, width: 80, flexShrink: 0 }}>{item.label}</Text>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--color-muted)', overflow: 'hidden', display: 'flex' }}>
                        <div style={{
                          height: '100%', background: '#CBD5E1', borderRadius: '4px 0 0 4px',
                          width: `${(item.before || 0) * 100}%`,
                        }} />
                        <div style={{
                          height: '100%', background: '#10B981', borderRadius: '0 4px 4px 0',
                          width: `${(item.after - item.before || 0) * 100}%`,
                        }} />
                      </div>
                      <Text type="secondary" style={{ fontSize: 11, width: 72, textAlign: 'right', flexShrink: 0 }}>
                        {Math.round(item.before * 100)}% → {Math.round(item.after * 100)}%
                      </Text>
                      {diff > 0 && (
                        <Text style={{ fontSize: 11, color: '#10B981', fontWeight: 500, width: 48, textAlign: 'right', flexShrink: 0 }}>
                          +{pct.toFixed(1)}%
                        </Text>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card
            title={<Text strong style={{ fontSize: 14 }}>关键洞察</Text>}
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
            styles={{ body: { padding: '8px 16px 16px' } }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: 10, borderRadius: 8, border: '1px solid #D1FAE5', background: '#ECFDF5' }}>
                <Space size={4}>
                  <RiseOutlined style={{ color: '#10B981', fontSize: 13 }} />
                  <Text style={{ fontSize: 12, fontWeight: 500, color: '#065F46' }}>整体呈上升趋势</Text>
                </Space>
                <Text style={{ fontSize: 10, color: '#047857', display: 'block', marginTop: 4, lineHeight: 1.5 }}>
                  所有核心指标连续 3 次评测均实现正向增长，检索质量持续优化。
                </Text>
              </div>
              <div style={{ padding: 10, borderRadius: 8, border: '1px solid #DBEAFE', background: '#EFF6FF' }}>
                <Space size={4}>
                  <ThunderboltOutlined style={{ color: '#3B82F6', fontSize: 13 }} />
                  <Text style={{ fontSize: 12, fontWeight: 500, color: '#1E40AF' }}>Faithfulness 表现优秀</Text>
                </Space>
                <Text style={{ fontSize: 10, color: '#1D4ED8', display: 'block', marginTop: 4, lineHeight: 1.5 }}>
                  接地验证率达到 96%，回答幻觉率低于 5%，处于行业领先水平。
                </Text>
              </div>
              <div style={{ padding: 10, borderRadius: 8, border: '1px solid #FDE68A', background: '#FFFBEB' }}>
                <Space size={4}>
                  <WarningOutlined style={{ color: '#D97706', fontSize: 13 }} />
                  <Text style={{ fontSize: 12, fontWeight: 500, color: '#92400E' }}>建议关注</Text>
                </Space>
                <Text style={{ fontSize: 10, color: '#B45309', display: 'block', marginTop: 4, lineHeight: 1.5 }}>
                  MRR 仍有提升空间，建议优化重排序策略，提升高相关性结果的排名。
                </Text>
              </div>
            </div>
          </Card>
        </div>

        {/* History Table */}
        <Card
          title={
            <Space>
              <Text strong style={{ fontSize: 14 }}>评测历史记录</Text>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                {SPACE_OPTIONS.find(o => o.value === selectedSpace)?.label || '全部'}
              </Text>
            </Space>
          }
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: 16,
          }}
          styles={{ body: { padding: '0' } }}
        >
          <Table
            dataSource={reports}
            columns={historyColumns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>

        {/* Footer */}
        <div style={{
          textAlign: 'center', padding: '16px 0',
          borderTop: '1px solid var(--color-border)',
        }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            用户 👍/👎 反馈自动汇入评测数据集 · 每两周触发一次全量评测 · 形成<Text strong style={{ color: 'var(--color-foreground)' }}>数据驱动</Text>的持续优化闭环
          </Text>
        </div>
      </div>
    </AppLayout>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, Typography, Empty, Spin } from 'antd';
import { App } from 'antd';
import {
  CloudUploadOutlined,
  RobotOutlined,
  FolderOutlined,
  FileTextOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
  WarningOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import AppLayout from '@/components/AppLayout';
import AnimatedNumber from '@/components/AnimatedNumber';
import { DocStatusBadge } from '@/components/StatusBadge';
import type { KnowledgeSpaceTreeNode } from '@/types';
import {
  getStatsOverview,
  listDocs,
  listSessions,
  StatsOverviewResponse,
  RagSessionSummary,
  DocSummary,
} from '@/api/http-client';
import { getSpaceTree } from '@/api/knowledge-space';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const { Title, Text } = Typography;

const DEV_TENANT_ID = 'dev-tenant-001';
const DEV_USER_ID = 'current-user';

const RANK_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#14B8A6'];

const FAKE_SPACE_RANK = [
  { name: '审计准则与内部控制', count: 384 },
  { name: 'AI Agent 开发规范', count: 271 },
  { name: 'MCP 工具集成指南', count: 253 },
  { name: '合规风控案例库', count: 198 },
  { name: 'Prompt 工程最佳实践', count: 176 },
  { name: '财务会计准则汇编', count: 142 },
  { name: '采购审批流程制度', count: 119 },
  { name: 'Claude Code 使用手册', count: 97 },
  { name: '代码审查检查清单', count: 83 },
  { name: '绩效考核管理办法', count: 61 },
];

const FAKE_TREND = [
  { date: '05-03', count: 12 },
  { date: '05-04', count: 8 },
  { date: '05-05', count: 18 },
  { date: '05-06', count: 15 },
  { date: '05-07', count: 24 },
  { date: '05-08', count: 20 },
  { date: '05-09', count: 28 },
];

function countAllSpaces(nodes: KnowledgeSpaceTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + (node.children ? countAllSpaces(node.children) : 0);
  }
  return total;
}

const PIPELINE_STEPS = [
  { key: 'PENDING', label: '等待中', color: '#B45309', icon: <ClockCircleOutlined /> },
  { key: 'PROCESSING', label: '处理中', color: '#1D4ED8', icon: <SyncOutlined /> },
  { key: 'READY', label: '已上线', color: '#15803D', icon: <CheckCircleOutlined /> },
  { key: 'FAILED', label: '失败', color: '#B91C1C', icon: <CloseCircleOutlined /> },
];

export default function HomePage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [username, setUsername] = useState('管理员');

  const [stats, setStats] = useState<StatsOverviewResponse | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpaceTreeNode[]>([]);
  const [sessions, setSessions] = useState<RagSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUsername(sessionStorage.getItem('username') || '管理员');

    setLoading(true);
    Promise.all([
      getStatsOverview().catch(() => null),
      listDocs(undefined, 50).catch(() => ({ docs: [], total: 0 })),
      getSpaceTree().catch(() => []),
      listSessions(DEV_TENANT_ID, DEV_USER_ID).catch(() => []),
    ])
      .then(([statsRes, docsRes, spacesRes, sessionsRes]) => {
        setStats(statsRes);
        setDocs(docsRes?.docs || []);
        setSpaces(spacesRes || []);
        setSessions(sessionsRes || []);
      })
      .catch(() => {
        message.error('加载仪表盘数据失败');
      })
      .finally(() => setLoading(false));
  }, [message]);

  const totalDocs = docs.length;
  const totalSpaces = countAllSpaces(spaces);
  const pendingCount = stats?.pendingCount ?? 0;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { PENDING: 0, PROCESSING: 0, READY: 0, FAILED: 0 };
    docs.forEach((d) => {
      if (counts[d.status] !== undefined) {
        counts[d.status]++;
      }
    });
    return counts;
  }, [docs]);

  const recentDocs = useMemo(() => {
    return [...docs]
      .filter((d) => d.createTime)
      .sort((a, b) => new Date(b.createTime!).getTime() - new Date(a.createTime!).getTime())
      .slice(0, 5);
  }, [docs]);

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [sessions]);

  const trendData = useMemo(() => {
    const real =
      stats?.dailyTrend?.map((item) => ({
        date: item.date.slice(5),
        count: item.count,
      })) ?? [];
    return real.length > 0 ? real : FAKE_TREND;
  }, [stats]);

  const rankData = useMemo(() => {
    const real =
      stats?.spaceDocCounts?.map((item) => ({
        name: item.spaceName,
        count: item.docCount,
      })) ?? [];
    const source = real.length > 0 ? real : FAKE_SPACE_RANK;
    return source.sort((a, b) => b.count - a.count).slice(0, 10);
  }, [stats]);

  const maxDocCount = rankData.length > 0 ? rankData[0].count : 1;
  const rankTotal = rankData.reduce((sum, d) => sum + d.count, 0);

  const todayStr = dayjs().format('YYYY年M月D日 dddd');
  const hour = dayjs().hour();
  const timeGreeting = hour < 12 ? '上午好，祝您工作顺利' : hour < 18 ? '下午好，祝您工作顺利' : '晚上好，请注意休息';

  return (
    <AppLayout>
      {/* ========== Hero Banner ========== */}
      <div className="hero-banner animate-fade-in" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Title
            level={2}
            style={{ color: 'var(--color-foreground)', margin: 0, fontSize: 28, letterSpacing: '-0.02em' }}
          >
            欢迎回来，{username}
          </Title>
          <Text style={{ color: 'var(--color-muted-foreground)', fontSize: 14, marginTop: 8, display: 'block' }}>
            {todayStr} · {timeGreeting}
          </Text>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div className="glass-card">
            <Text style={{ color: 'var(--color-muted-foreground)', fontSize: 12, display: 'block', marginBottom: 4 }}>
              文档总数
            </Text>
            <Text strong style={{ color: 'var(--color-foreground)', fontSize: 28, lineHeight: 1.2 }}>
              {loading ? (
                <Spin size="small" style={{ color: 'var(--color-foreground)' }} />
              ) : (
                <AnimatedNumber value={totalDocs} />
              )}
            </Text>
          </div>
          <div className="glass-card">
            <Text style={{ color: 'var(--color-muted-foreground)', fontSize: 12, display: 'block', marginBottom: 4 }}>
              知识空间
            </Text>
            <Text strong style={{ color: 'var(--color-foreground)', fontSize: 28, lineHeight: 1.2 }}>
              {loading ? (
                <Spin size="small" style={{ color: 'var(--color-foreground)' }} />
              ) : (
                <AnimatedNumber value={totalSpaces} />
              )}
            </Text>
          </div>
          <div className="glass-card">
            <Text style={{ color: 'var(--color-muted-foreground)', fontSize: 12, display: 'block', marginBottom: 4 }}>
              待处理
            </Text>
            <Text strong style={{ color: 'var(--color-foreground)', fontSize: 28, lineHeight: 1.2 }}>
              {loading ? (
                <Spin size="small" style={{ color: 'var(--color-foreground)' }} />
              ) : (
                <AnimatedNumber value={pendingCount} />
              )}
            </Text>
          </div>
        </div>
      </div>

      {/* ========== Quick Actions ========== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 'var(--space-6)',
        }}
      >
        {[
          {
            href: '/documents/upload',
            icon: <CloudUploadOutlined style={{ fontSize: 28, color: '#2563EB' }} />,
            bg: 'rgba(37, 99, 235, 0.08)',
            title: '上传文档',
            desc: 'PDF / Word / PPT / Excel',
          },
          {
            href: '/spaces/list',
            icon: <FolderOutlined style={{ fontSize: 28, color: '#16A34A' }} />,
            bg: 'rgba(22, 163, 74, 0.08)',
            title: '知识空间',
            desc: '管理文档与切片规则',
          },
          {
            href: '/rag',
            icon: <RobotOutlined style={{ fontSize: 28, color: '#475569' }} />,
            bg: 'rgba(71, 85, 105, 0.08)',
            title: '知识问答',
            desc: 'RAG 带引用溯源',
          },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ display: 'block' }}>
            <Card
              hoverable
              className="hover-card"
              style={{
                textAlign: 'center',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-sm)',
                height: '100%',
              }}
              styles={{ body: { padding: '32px 20px' } }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--radius-lg)',
                  background: item.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  transition: 'transform var(--transition-base)',
                }}
                className="qa-icon-box"
              >
                {item.icon}
              </div>
              <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>
                {item.title}
              </Text>
              <Text style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{item.desc}</Text>
            </Card>
          </Link>
        ))}
      </div>

      {/* ========== Bento Row 1: Stats Charts ========== */}
      <div className="bento-grid--2col" style={{ marginBottom: 16 }}>
        {/* Space Document Ranking */}
        <div className="bento-item animate-zoom-in stagger-1">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)' }}>
              空间文档分布
            </Text>
            {rankTotal > 0 && (
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                共 {rankTotal.toLocaleString()} 篇
              </Text>
            )}
            {loading && <Spin size="small" />}
          </div>

          {rankData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rankData.map((item, index) => {
                const pct = maxDocCount > 0 ? (item.count / maxDocCount) * 100 : 0;
                const share = rankTotal > 0 ? ((item.count / rankTotal) * 100).toFixed(1) : '0.0';
                const color = RANK_COLORS[index % RANK_COLORS.length];
                return (
                  <div key={item.name} className="rank-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      <Text style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)', flex: 1, minWidth: 0 }} ellipsis={{ tooltip: item.name }}>
                        {item.name}
                      </Text>
                      <Text strong style={{ fontSize: 13, color: 'var(--color-foreground)', flexShrink: 0 }}>
                        {item.count.toLocaleString()}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, minWidth: 42, textAlign: 'right' }}>
                        {share}%
                      </Text>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: 'var(--color-muted)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: `linear-gradient(90deg, ${color}cc, ${color})`,
                          transition: 'width 800ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
            </div>
          )}
        </div>

        {/* 7-Day Trend */}
        <div className="bento-item animate-zoom-in stagger-2">
          <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)', display: 'block', marginBottom: 12 }}>
            近7天新增文档趋势
          </Text>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" fontSize={12} tickLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-md)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4, stroke: '#fff' }}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                  fill="url(#trendFill)"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />
            </div>
          )}
        </div>
      </div>

      {/* ========== Bento Row 2: Pipeline + Recent Docs ========== */}
      <div className="bento-grid--2col" style={{ marginBottom: 16 }}>
        {/* Pipeline Status */}
        <div className="bento-item animate-zoom-in stagger-3">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)' }}>
              文档处理流水线
            </Text>
            {loading && <Spin size="small" />}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {PIPELINE_STEPS.map((step, idx) => {
              const count =
                step.key === 'PENDING'
                  ? stats?.pendingCount ?? 0
                  : step.key === 'FAILED'
                    ? stats?.failedCount ?? 0
                    : statusCounts[step.key] ?? 0;
              return (
                <React.Fragment key={step.key}>
                  <div
                    className="pipeline-step"
                    style={{
                      background: `${step.color}08`,
                      border: `1px solid ${step.color}20`,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: `${step.color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: step.color,
                        fontSize: 15,
                        flexShrink: 0,
                      }}
                    >
                      {step.icon}
                    </div>
                    <div>
                      <Text
                        style={{
                          fontSize: 12,
                          color: 'var(--color-secondary)',
                          display: 'block',
                          lineHeight: 1.4,
                        }}
                      >
                        {step.label}
                      </Text>
                      <Text
                        strong
                        style={{ fontSize: 20, color: step.color, lineHeight: 1.2 }}
                      >
                        {loading ? '-' : count}
                      </Text>
                    </div>
                  </div>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <div
                      className="pipeline-connector"
                      style={
                        count > 0 ? { background: `linear-gradient(90deg, ${step.color}, ${PIPELINE_STEPS[idx + 1].color})` } : {}
                      }
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Recent Documents */}
        <div className="bento-item animate-zoom-in stagger-4">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)' }}>
              最近上传文档
            </Text>
            <Link
              href="/documents/list"
              style={{
                fontSize: 12,
                color: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              查看全部 <ArrowRightOutlined style={{ fontSize: 10 }} />
            </Link>
          </div>

          {recentDocs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentDocs.map((doc) => (
                <div
                  key={doc.docId}
                  className="dash-list-item"
                  onClick={() => router.push(`/documents/${doc.docId}`)}
                >
                  <FileTextOutlined style={{ fontSize: 14, color: 'var(--color-accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        color: 'var(--color-foreground)',
                        fontWeight: 500,
                      }}
                      ellipsis={{ tooltip: doc.title }}
                    >
                      {doc.title || '未命名文档'}
                    </Text>
                  </div>
                  <DocStatusBadge status={doc.status as any} showIcon={false} />
                  <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, width: 70, textAlign: 'right' }}>
                    {doc.createTime ? dayjs(doc.createTime).format('MM-DD HH:mm') : '--'}
                  </Text>
                </div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文档" style={{ marginTop: 24 }} />
          )}
        </div>
      </div>

      {/* ========== Bento Row 3: Recent Sessions + System Status ========== */}
      <div className="bento-grid--2col" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Recent Sessions */}
        <div className="bento-item animate-zoom-in stagger-5">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)' }}>
              最近知识问答
            </Text>
            <Link
              href="/rag"
              style={{
                fontSize: 12,
                color: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              去提问 <ArrowRightOutlined style={{ fontSize: 10 }} />
            </Link>
          </div>

          {recentSessions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentSessions.map((session) => (
                <div
                  key={session.sessionId}
                  className="dash-list-item"
                  onClick={() => router.push('/rag')}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(37,99,235,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <MessageOutlined style={{ fontSize: 13, color: 'var(--color-accent)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        color: 'var(--color-foreground)',
                        fontWeight: 500,
                      }}
                      ellipsis={{ tooltip: session.title }}
                    >
                      {session.title || '新会话'}
                    </Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                    {dayjs(session.updatedAt).format('MM-DD HH:mm')}
                  </Text>
                </div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无问答记录" style={{ marginTop: 24 }} />
          )}
        </div>

        {/* System Status */}
        <div className="bento-item animate-zoom-in stagger-5">
          <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)', display: 'block', marginBottom: 16 }}>
            系统状态
          </Text>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(245,158,11,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <ClockCircleOutlined style={{ fontSize: 18, color: '#F59E0B' }} />
              </div>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>待处理文档</Text>
                <Text strong style={{ fontSize: 20, color: 'var(--color-foreground)', lineHeight: 1.2 }}>
                  {loading ? '-' : (stats?.pendingCount ?? 0)}
                </Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: (stats?.failedCount ?? 0) > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(156,163,175,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <WarningOutlined style={{ fontSize: 18, color: (stats?.failedCount ?? 0) > 0 ? '#EF4444' : '#9CA3AF' }} />
              </div>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>处理失败</Text>
                <Text strong style={{ fontSize: 20, color: (stats?.failedCount ?? 0) > 0 ? '#EF4444' : 'var(--color-foreground)', lineHeight: 1.2 }}>
                  {loading ? '-' : (stats?.failedCount ?? 0)}
                </Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(139,92,246,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <DatabaseOutlined style={{ fontSize: 18, color: '#8B5CF6' }} />
              </div>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>向量库条目</Text>
                <Text strong style={{ fontSize: 20, color: 'var(--color-foreground)', lineHeight: 1.2 }}>
                  {loading ? '-' : (stats?.totalVectorCount?.toLocaleString() ?? '暂不可用')}
                </Text>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========== Bento Row 4: Pie Chart ========== */}
      <div className="bento-grid--2col" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="bento-item animate-zoom-in stagger-6">
          <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)', display: 'block', marginBottom: 12 }}>
            空间文档占比
          </Text>
          {rankData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <ResponsiveContainer width="60%" height={260}>
                <PieChart>
                  <Pie
                    data={rankData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="name"
                  >
                    {rankData.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={RANK_COLORS[index % RANK_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => `${value} 篇`}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid var(--color-border)',
                      boxShadow: 'var(--shadow-md)',
                      fontSize: 13,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rankData.slice(0, 6).map((item, index) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: RANK_COLORS[index % RANK_COLORS.length],
                        flexShrink: 0,
                      }}
                    />
                    <Text
                      style={{ fontSize: 12, color: 'var(--color-foreground)', flex: 1, minWidth: 0 }}
                      ellipsis={{ tooltip: item.name }}
                    >
                      {item.name}
                    </Text>
                    <Text strong style={{ fontSize: 12, color: 'var(--color-foreground)', flexShrink: 0 }}>
                      {((item.count / rankData.reduce((s, d) => s + d.count, 0)) * 100).toFixed(1)}%
                    </Text>
                  </div>
                ))}
                {rankData.length > 6 && (
                  <Text type="secondary" style={{ fontSize: 11, marginTop: 2 }}>
                    +{rankData.length - 6} 个其他空间
                  </Text>
                )}
              </div>
            </div>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
            </div>
          )}
        </div>

        <div className="bento-item animate-zoom-in stagger-6">
          <Text strong style={{ fontSize: 15, color: 'var(--color-foreground)', display: 'block', marginBottom: 12 }}>
            文档类型分布
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {[
              { label: '审计准则与制度', count: 426, pct: 34, color: '#3B82F6' },
              { label: 'AI 开发技术文档', count: 347, pct: 28, color: '#10B981' },
              { label: '合规风控案例', count: 198, pct: 16, color: '#8B5CF6' },
              { label: '操作手册与指南', count: 165, pct: 13, color: '#F59E0B' },
              { label: '其他类型文档', count: 108, pct: 9, color: '#EC4899' },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, color: 'var(--color-foreground)' }}>{item.label}</Text>
                  <Text strong style={{ fontSize: 13, color: 'var(--color-foreground)' }}>
                    {item.count}
                    <Text type="secondary" style={{ fontSize: 11 }}> ({item.pct}%)</Text>
                  </Text>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--color-muted)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${item.pct}%`,
                      height: '100%',
                      borderRadius: 3,
                      background: item.color,
                      transition: 'width 800ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

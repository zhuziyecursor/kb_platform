'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Typography,
  Card,
  Table,
  Tag,
  Drawer,
  App,
  DatePicker,
  Select,
  Empty,
  Tooltip,
  Segmented,
  Spin,
} from 'antd';
import {
  DashboardOutlined,
  LinkOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileSearchOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LikeOutlined,
  DislikeOutlined,
  FlagOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import PipelineTraceView from '@/components/PipelineTraceView';
import DashboardView from '@/components/DashboardView';
import BadcaseKanban from '@/components/BadcaseKanban';
import {
  listPipelineTraces,
  listBadcases,
  listFeedback,
  listDocAudit,
  getPipelineTrace,
  getErrorMessage,
} from '@/api/http-client';
import type {
  RagPipelineTraceSummary,
  RagPipelineTraceResponse,
  BadcaseItem,
  FeedbackResponse,
  DocAuditItem,
} from '@/api/http-client';
import { Button } from '@/components/ui';
import dayjs from 'dayjs';
import { useUserContext } from '@/hooks/useUserContext';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const RESULT_MAP: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  SUCCESS: { color: 'success', label: '成功', icon: <CheckCircleOutlined /> },
  REFUSED: { color: 'warning', label: '拒答', icon: <ExclamationCircleOutlined /> },
  ERROR: { color: 'error', label: '异常', icon: <CloseCircleOutlined /> },
};

const FEEDBACK_TYPE_MAP: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  LIKE: { color: 'success', label: '点赞', icon: <LikeOutlined /> },
  DISLIKE: { color: 'error', label: '点踩', icon: <DislikeOutlined /> },
  REPORT: { color: 'warning', label: '报告', icon: <FlagOutlined /> },
};

const BADCASE_STATUS_MAP: Record<string, { color: string; label: string }> = {
  OPEN: { color: 'red', label: '待处理' },
  REVIEWED: { color: 'blue', label: '已复核' },
  RESOLVED: { color: 'green', label: '已解决' },
  DISMISSED: { color: 'default', label: '已忽略' },
};

export default function MonitorPage() {
  const { message } = App.useApp();
  const { tenantId } = useUserContext();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardPeriod, setDashboardPeriod] = useState('7days');

  // Trace list state
  const [traceData, setTraceData] = useState<RagPipelineTraceSummary[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceTotal, setTraceTotal] = useState(0);
  const [tracePage, setTracePage] = useState(0);
  const [tracePageSize, setTracePageSize] = useState(20);
  const [traceResultFilter, setTraceResultFilter] = useState<string | undefined>();
  const [traceDateRange, setTraceDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // Feedback list state
  const [feedbackData, setFeedbackData] = useState<FeedbackResponse[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackPage, setFeedbackPage] = useState(0);
  const [feedbackPageSize, setFeedbackPageSize] = useState(20);
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<string | undefined>();
  const [feedbackDateRange, setFeedbackDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // Badcase list state
  const [badcaseData, setBadcaseData] = useState<BadcaseItem[]>([]);
  const [badcaseLoading, setBadcaseLoading] = useState(false);
  const [badcaseTotal, setBadcaseTotal] = useState(0);
  const [badcasePage, setBadcasePage] = useState(0);
  const [badcasePageSize, setBadcasePageSize] = useState(20);
  const [badcaseStatusFilter, setBadcaseStatusFilter] = useState<string | undefined>();
  const [badcaseTypeFilter, setBadcaseTypeFilter] = useState<string | undefined>();
  const [badcaseViewMode, setBadcaseViewMode] = useState<'table' | 'kanban'>('kanban');

  // Operations log state
  const [opsData, setOpsData] = useState<DocAuditItem[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsTotal, setOpsTotal] = useState(0);
  const [opsPage, setOpsPage] = useState(0);
  const [opsPageSize, setOpsPageSize] = useState(20);
  const [opsActionFilter, setOpsActionFilter] = useState<string | undefined>();

  // Detail drawer state (kept for feedback/badcase tabs)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [traceDetail, setTraceDetail] = useState<RagPipelineTraceResponse | null>(null);
  const [traceDetailLoading, setTraceDetailLoading] = useState(false);
  const [detailTraceId, setDetailTraceId] = useState<string | null>(null);

  // Inline expansion state
  const [expandedTraceKeys, setExpandedTraceKeys] = useState<Set<string>>(new Set());
  const [traceDetailCache, setTraceDetailCache] = useState<Map<string, RagPipelineTraceResponse | null>>(new Map());

  const fetchTraces = useCallback(async () => {
    setTraceLoading(true);
    try {
      const [from, to] = traceDateRange || [];
      const res = await listPipelineTraces({
        tenantId,
        result: traceResultFilter,
        from: from?.startOf('day').toISOString(),
        to: to?.endOf('day').toISOString(),
        page: tracePage,
        size: tracePageSize,
      });
      setTraceData(res.items);
      setTraceTotal(res.total);
    } catch (err) {
      message.error(getErrorMessage(err, '加载请求日志失败'));
    } finally {
      setTraceLoading(false);
    }
  }, [tenantId, traceResultFilter, traceDateRange, tracePage, tracePageSize, message]);

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    try {
      const [from, to] = feedbackDateRange || [];
      const res = await listFeedback({
        tenantId,
        feedbackType: feedbackTypeFilter,
        from: from?.startOf('day').toISOString(),
        to: to?.endOf('day').toISOString(),
        page: feedbackPage,
        size: feedbackPageSize,
      });
      setFeedbackData(res.items);
      setFeedbackTotal(res.total);
    } catch (err) {
      message.error(getErrorMessage(err, '加载反馈日志失败'));
    } finally {
      setFeedbackLoading(false);
    }
  }, [tenantId, feedbackTypeFilter, feedbackDateRange, feedbackPage, feedbackPageSize, message]);

  const fetchBadcases = useCallback(async () => {
    setBadcaseLoading(true);
    try {
      const res = await listBadcases({
        tenantId,
        status: badcaseStatusFilter,
        feedbackType: badcaseTypeFilter,
        page: badcasePage,
        size: badcasePageSize,
      });
      setBadcaseData(res.items);
      setBadcaseTotal(res.total);
    } catch (err) {
      message.error(getErrorMessage(err, '加载 Badcase 列表失败'));
    } finally {
      setBadcaseLoading(false);
    }
  }, [tenantId, badcaseStatusFilter, badcaseTypeFilter, badcasePage, badcasePageSize, message]);

  useEffect(() => {
    if (activeTab === 'traces') fetchTraces();
  }, [activeTab, fetchTraces]);

  useEffect(() => {
    if (activeTab === 'feedback') fetchFeedback();
  }, [activeTab, fetchFeedback]);

  const fetchOpsLog = useCallback(async () => {
    setOpsLoading(true);
    try {
      const res = await listDocAudit({
        tenantId,
        action: opsActionFilter,
        page: opsPage,
        size: opsPageSize,
      });
      setOpsData(res.items);
      setOpsTotal(res.total);
    } catch (err) {
      message.error(getErrorMessage(err, '加载操作日志失败'));
    } finally {
      setOpsLoading(false);
    }
  }, [tenantId, opsActionFilter, opsPage, opsPageSize, message]);

  useEffect(() => {
    if (activeTab === 'traces') fetchTraces();
  }, [activeTab, fetchTraces]);

  useEffect(() => {
    if (activeTab === 'feedback') fetchFeedback();
  }, [activeTab, fetchFeedback]);

  useEffect(() => {
    if (activeTab === 'badcases') fetchBadcases();
  }, [activeTab, fetchBadcases]);

  useEffect(() => {
    if (activeTab === 'operations') fetchOpsLog();
  }, [activeTab, fetchOpsLog]);

  const openTraceDetail = async (traceId: string) => {
    setDetailTraceId(traceId);
    setDrawerTitle(`链路详情 — ${traceId}`);
    setDrawerOpen(true);
    setTraceDetailLoading(true);
    setTraceDetail(null);
    try {
      const detail = await getPipelineTrace(traceId);
      setTraceDetail(detail);
    } catch {
      setTraceDetail(null);
    } finally {
      setTraceDetailLoading(false);
    }
  };

  const handleTraceExpand = async (expanded: boolean, record: RagPipelineTraceSummary) => {
    const tid = record.traceId;
    const newKeys = new Set(expandedTraceKeys);

    if (expanded) {
      newKeys.add(tid);
      if (!traceDetailCache.has(tid)) {
        try {
          const detail = await getPipelineTrace(tid);
          setTraceDetailCache((prev) => new Map(prev).set(tid, detail));
        } catch {
          setTraceDetailCache((prev) => new Map(prev).set(tid, null));
        }
      }
    } else {
      newKeys.delete(tid);
    }

    setExpandedTraceKeys(newKeys);
  };

  const traceColumns: ColumnsType<RagPipelineTraceSummary> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => (
        <Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
          <ClockCircleOutlined style={{ marginRight: 4, color: 'var(--color-secondary)' }} />
          {dayjs(v).format('MM-DD HH:mm:ss')}
        </Text>
      ),
    },
    {
      title: 'Trace ID',
      dataIndex: 'traceId',
      width: 180,
      render: (v: string) => (
        <Text code copyable style={{ fontSize: 12 }}>{v.slice(0, 18)}...</Text>
      ),
    },
    {
      title: '用户',
      dataIndex: 'uid',
      width: 100,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: '查询内容',
      dataIndex: 'queryText',
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text style={{ fontSize: 13 }}>{v || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'result',
      width: 90,
      render: (v: string) => {
        const m = RESULT_MAP[v] || { color: 'default', label: v, icon: null };
        return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
      },
    },
    {
      title: '耗时',
      dataIndex: 'totalMs',
      width: 90,
      sorter: (a, b) => a.totalMs - b.totalMs,
      render: (v: number) => <Text style={{ fontSize: 13 }}>{v}ms</Text>,
    },
    {
      title: '引用',
      dataIndex: 'citationsCount',
      width: 70,
      render: (v: number) => <Text style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) => {
        const isExpanded = expandedTraceKeys.has(record.traceId);
        return (
          <Button
            variant={isExpanded ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleTraceExpand(!isExpanded, record)}
          >
            {isExpanded ? '收起' : '展开'}
          </Button>
        );
      },
    },
  ];

  const feedbackColumns: ColumnsType<FeedbackResponse> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => (
        <Text style={{ fontSize: 13 }}>
          <ClockCircleOutlined style={{ marginRight: 4, color: 'var(--color-secondary)' }} />
          {dayjs(v).format('MM-DD HH:mm:ss')}
        </Text>
      ),
    },
    {
      title: 'Trace ID',
      dataIndex: 'traceId',
      width: 180,
      render: (v: string) => (
        <Text code copyable style={{ fontSize: 12 }}>{v.slice(0, 18)}...</Text>
      ),
    },
    {
      title: '反馈类型',
      dataIndex: 'feedbackType',
      width: 100,
      render: (v: string) => {
        const m = FEEDBACK_TYPE_MAP[v] || { color: 'default', label: v, icon: null };
        return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
      },
    },
    {
      title: '原因',
      dataIndex: 'reportReason',
      width: 120,
      render: (v?: string) => v ? <Tag>{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '评论',
      dataIndex: 'comment',
      ellipsis: true,
      render: (v?: string) => (
        <Tooltip title={v}>
          <Text style={{ fontSize: 13 }}>{v || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openTraceDetail(record.traceId)}
        >
          链路
        </Button>
      ),
    },
  ];

  const badcaseColumns: ColumnsType<BadcaseItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => (
        <Text style={{ fontSize: 13 }}>
          <ClockCircleOutlined style={{ marginRight: 4, color: 'var(--color-secondary)' }} />
          {dayjs(v).format('MM-DD HH:mm:ss')}
        </Text>
      ),
    },
    {
      title: 'Trace ID',
      dataIndex: 'traceId',
      width: 180,
      render: (v: string) => (
        <Text code copyable style={{ fontSize: 12 }}>{v.slice(0, 18)}...</Text>
      ),
    },
    {
      title: '查询',
      dataIndex: 'queryText',
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text style={{ fontSize: 13 }}>{v || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: '反馈类型',
      dataIndex: 'feedbackType',
      width: 100,
      render: (v: string) => {
        const m = FEEDBACK_TYPE_MAP[v] || { color: 'default', label: v, icon: null };
        return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const m = BADCASE_STATUS_MAP[v] || { color: 'default', label: v };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '原因',
      dataIndex: 'reportReason',
      width: 120,
      render: (v?: string) => v ? <Tag>{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '评论',
      dataIndex: 'comment',
      ellipsis: true,
      render: (v?: string) => (
        <Tooltip title={v}>
          <Text style={{ fontSize: 13 }}>{v || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openTraceDetail(record.traceId)}
        >
          链路
        </Button>
      ),
    },
  ];

  const opsActionLabels: Record<string, string> = {
    UPLOAD: '上传', COMMIT: '提交', INGEST_START: '入库开始', INGEST_COMPLETE: '入库完成',
    INGEST_FAILED: '入库失败', DELETE: '删除', RETRY: '重试', STATUS_CHANGE: '状态变更',
    SEARCH_HIT: '搜索命中', PERMISSION_CHANGE: '权限变更',
  };

  const opsColumns: ColumnsType<DocAuditItem> = [
    {
      title: '时间',
      dataIndex: 'ts',
      width: 160,
      render: (v: string) => (
        <Text style={{ fontSize: 13 }}>
          <ClockCircleOutlined style={{ marginRight: 4, color: 'var(--color-secondary)' }} />
          {dayjs(v).format('MM-DD HH:mm:ss')}
        </Text>
      ),
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 100,
      render: (v: string) => {
        const colors: Record<string, string> = {
          UPLOAD: 'blue', COMMIT: 'cyan', INGEST_START: 'processing', INGEST_COMPLETE: 'success',
          INGEST_FAILED: 'error', DELETE: 'red', RETRY: 'warning', STATUS_CHANGE: 'purple',
          SEARCH_HIT: 'green', PERMISSION_CHANGE: 'gold',
        };
        return <Tag color={colors[v] || 'default'}>{opsActionLabels[v] || v}</Tag>;
      },
    },
    {
      title: '文档 ID',
      dataIndex: 'docId',
      width: 160,
      render: (v?: string) => v ? <Text code style={{ fontSize: 11 }}>{v.slice(0, 16)}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '用户',
      dataIndex: 'uid',
      width: 100,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 80,
      render: (v: string) => (
        <Tag color={v === 'SUCCESS' ? 'success' : 'error'}>{v === 'SUCCESS' ? '成功' : '失败'}</Tag>
      ),
    },
    {
      title: '详情',
      dataIndex: 'detail',
      ellipsis: true,
      width: 180,
      render: (v?: string) => {
        if (!v) return <Text type="secondary">-</Text>;
        try {
          const d = JSON.parse(v);
          const summary = d.filename || d.errorMsg || d.query || d.from + '→' + d.to || JSON.stringify(d).slice(0, 40);
          return <Tooltip title={<pre style={{ fontSize: 11, margin: 0 }}>{JSON.stringify(d, null, 2)}</pre>}>
            <Text style={{ fontSize: 12 }}>{summary}</Text>
          </Tooltip>;
        } catch {
          return <Text style={{ fontSize: 12 }}>{v.slice(0, 40)}</Text>;
        }
      },
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      width: 110,
      render: (v?: string) => <Text style={{ fontSize: 12 }}>{v || '-'}</Text>,
    },
  ];

  const tabItems = [
    {
      key: 'dashboard',
      label: '仪表盘',
      children: (
        <DashboardView period={dashboardPeriod} onPeriodChange={setDashboardPeriod} />
      ),
    },
    {
      key: 'traces',
      label: '请求日志',
      children: (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select
              placeholder="状态筛选"
              allowClear
              style={{ width: 140 }}
              value={traceResultFilter}
              onChange={(val) => { setTraceResultFilter(val); setTracePage(0); }}
              options={[
                { label: '成功', value: 'SUCCESS' },
                { label: '拒答', value: 'REFUSED' },
                { label: '异常', value: 'ERROR' },
              ]}
            />
            <RangePicker
              value={traceDateRange as any}
              onChange={(dates) => { setTraceDateRange(dates as any); setTracePage(0); }}
              placeholder={['开始日期', '结束日期']}
              allowClear
            />
            <Button
              variant="secondary"
              icon={<ReloadOutlined />}
              onClick={fetchTraces}
              loading={traceLoading}
            >
              刷新
            </Button>
          </div>
          <Table
            columns={traceColumns}
            dataSource={traceData}
            rowKey="traceId"
            loading={traceLoading}
            size="middle"
            expandable={{
              expandedRowRender: (record) => {
                const detail = traceDetailCache.get(record.traceId);
                if (detail === undefined) {
                  return (
                    <div style={{ padding: '20px 40px', textAlign: 'center' }}>
                      <Spin size="small" />
                    </div>
                  );
                }
                if (detail === null) {
                  return (
                    <div style={{ padding: '20px 40px', textAlign: 'center' }}>
                      <Text type="secondary">加载失败</Text>
                    </div>
                  );
                }
                return (
                  <div style={{ padding: '8px 0' }}>
                    <PipelineTraceView trace={detail} loading={false} traceId={record.traceId} />
                  </div>
                );
              },
              rowExpandable: () => true,
              expandedRowKeys: Array.from(expandedTraceKeys),
              onExpand: handleTraceExpand,
            }}
            pagination={{
              current: tracePage + 1,
              pageSize: tracePageSize,
              total: traceTotal,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, s) => { setTracePage(p - 1); setTracePageSize(s); },
            }}
            locale={{ emptyText: <Empty description="暂无请求日志" /> }}
          />
        </div>
      ),
    },
    {
      key: 'feedback',
      label: '反馈审计',
      children: (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select
              placeholder="反馈类型"
              allowClear
              style={{ width: 140 }}
              value={feedbackTypeFilter}
              onChange={(val) => { setFeedbackTypeFilter(val); setFeedbackPage(0); }}
              options={[
                { label: '点赞', value: 'LIKE' },
                { label: '点踩', value: 'DISLIKE' },
                { label: '报告', value: 'REPORT' },
              ]}
            />
            <RangePicker
              value={feedbackDateRange as any}
              onChange={(dates) => { setFeedbackDateRange(dates as any); setFeedbackPage(0); }}
              placeholder={['开始日期', '结束日期']}
              allowClear
            />
            <Button
              variant="secondary"
              icon={<ReloadOutlined />}
              onClick={fetchFeedback}
              loading={feedbackLoading}
            >
              刷新
            </Button>
          </div>
          <Table
            columns={feedbackColumns}
            dataSource={feedbackData}
            rowKey="id"
            loading={feedbackLoading}
            size="middle"
            pagination={{
              current: feedbackPage + 1,
              pageSize: feedbackPageSize,
              total: feedbackTotal,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, s) => { setFeedbackPage(p - 1); setFeedbackPageSize(s); },
            }}
            locale={{ emptyText: <Empty description="暂无反馈记录" /> }}
          />
        </div>
      ),
    },
    {
      key: 'badcases',
      label: '问题归档',
      children: (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {badcaseViewMode === 'table' && (
                <>
                  <Select
                    placeholder="反馈类型"
                    allowClear
                    style={{ width: 140 }}
                    value={badcaseTypeFilter}
                    onChange={(val) => { setBadcaseTypeFilter(val); setBadcasePage(0); }}
                    options={[
                      { label: '点踩', value: 'DISLIKE' },
                      { label: '报告', value: 'REPORT' },
                    ]}
                  />
                  <Select
                    placeholder="处理状态"
                    allowClear
                    style={{ width: 140 }}
                    value={badcaseStatusFilter}
                    onChange={(val) => { setBadcaseStatusFilter(val); setBadcasePage(0); }}
                    options={[
                      { label: '待处理', value: 'OPEN' },
                      { label: '已复核', value: 'REVIEWED' },
                      { label: '已解决', value: 'RESOLVED' },
                      { label: '已忽略', value: 'DISMISSED' },
                    ]}
                  />
                  <Button
                    variant="secondary"
                    icon={<ReloadOutlined />}
                    onClick={fetchBadcases}
                    loading={badcaseLoading}
                  >
                    刷新
                  </Button>
                </>
              )}
            </div>
            <Segmented
              value={badcaseViewMode}
              onChange={(val) => setBadcaseViewMode(val as 'table' | 'kanban')}
              options={[
                { label: '看板', value: 'kanban' },
                { label: '列表', value: 'table' },
              ]}
            />
          </div>
          {badcaseViewMode === 'kanban' ? (
            <BadcaseKanban />
          ) : (
            <Table
              columns={badcaseColumns}
              dataSource={badcaseData}
              rowKey="id"
              loading={badcaseLoading}
              size="middle"
              pagination={{
                current: badcasePage + 1,
                pageSize: badcasePageSize,
                total: badcaseTotal,
                showSizeChanger: true,
                showTotal: (t) => `共 ${t} 条`,
                onChange: (p, s) => { setBadcasePage(p - 1); setBadcasePageSize(s); },
              }}
              locale={{ emptyText: <Empty description="暂无归档问题" /> }}
            />
          )}
        </div>
      ),
    },
    {
      key: 'operations',
      label: '操作日志',
      children: (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select
              placeholder="操作类型"
              allowClear
              style={{ width: 160 }}
              value={opsActionFilter}
              onChange={(val) => { setOpsActionFilter(val); setOpsPage(0); }}
              options={Object.entries(opsActionLabels).map(([k, v]) => ({ label: v, value: k }))}
            />
            <Button
              variant="secondary"
              icon={<ReloadOutlined />}
              onClick={fetchOpsLog}
              loading={opsLoading}
            >
              刷新
            </Button>
          </div>
          <Table
            columns={opsColumns}
            dataSource={opsData}
            rowKey="id"
            loading={opsLoading}
            size="small"
            pagination={{
              current: opsPage + 1,
              pageSize: opsPageSize,
              total: opsTotal,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, s) => { setOpsPage(p - 1); setOpsPageSize(s); },
            }}
            locale={{ emptyText: <Empty description="暂无操作日志" /> }}
          />
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="监控日志"
        description="RAG 请求追踪、用户反馈审计、系统操作日志"
        breadcrumbs={[{ title: '监控日志' }]}
      />

      {/* Grafana Quick Link */}
      <Card style={{ marginBottom: 24 }} styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #F46800 0%, #FF9830 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <DashboardOutlined style={{ fontSize: 20, color: '#fff' }} />
            </div>
            <div>
              <Text strong style={{ fontSize: 14 }}>Grafana 可观测性面板</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                全量日志检索 · 服务指标 · 调用链追踪
              </Text>
            </div>
          </div>
          <a href="http://localhost:31009" target="_blank" rel="noopener noreferrer">
            <Button variant="primary" size="sm" icon={<LinkOutlined />}>
              打开 Grafana
            </Button>
          </a>
        </div>
      </Card>

      {/* Tabbed Log Views */}
      <Card styles={{ body: { padding: '8px 24px 24px' } }}>
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-border)',
            marginBottom: 16,
          }}
        >
          {tabItems.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-secondary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--color-accent)' : '2px solid transparent',
                transition: 'all 0.2s',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {tabItems.find((t) => t.key === activeTab)?.children}
      </Card>

      {/* Trace Detail Drawer */}
      <Drawer
        title={drawerTitle}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        <PipelineTraceView
          trace={traceDetail}
          loading={traceDetailLoading}
          traceId={detailTraceId}
        />
      </Drawer>
    </AppLayout>
  );
}

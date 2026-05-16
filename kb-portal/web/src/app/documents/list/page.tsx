'use client';

import React, { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import {
  Table,
  Card,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Typography,
  Modal,
  App,
  Descriptions,
  Segmented,
  Row,
  Col,
  Dropdown,
  Tooltip,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  MoreOutlined,
  FileTextOutlined,
  ClusterOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DocStatus, SecLevel, DocType, KnowledgeSpace } from '@/types';
import { listSpaces } from '@/api/knowledge-space';
import { listDocs, deleteDoc, retryDoc, getDocStatus, DocSummary } from '@/api/http-client';
import CommandBar from '@/components/LUI/CommandBar';
import FilePreview from '@/components/FilePreview';
import PipelineDetailModal from '@/components/PipelineDetailModal';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { DocStatusBadge, DocTypeBadge, SecLevelBadge } from '@/components/StatusBadge';
import type { LUIAction } from '@/types';
import dayjs from 'dayjs';
import { useRouter, useSearchParams } from 'next/navigation';

const { Text } = Typography;

const STATUS_ACCENT: Record<string, string> = {
  READY: 'var(--color-success)',
  PROCESSING: 'var(--color-info)',
  PENDING: 'var(--color-warning)',
  FAILED: 'var(--color-destructive)',
  DRAFT: 'var(--color-secondary)',
};

function DocumentListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSpaceId = searchParams.get('spaceId');
  const [data, setData] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | undefined>(urlSpaceId || undefined);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocStatus | 'ALL'>('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocSummary | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocSummary | null>(null);
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [pipelineDoc, setPipelineDoc] = useState<DocSummary | null>(null);
  const [retryingDocIds, setRetryingDocIds] = useState<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const { modal, message } = App.useApp();

  useEffect(() => {
    listSpaces().then(setSpaces).catch(() => message.error('加载知识空间失败'));
  }, []);

  useEffect(() => {
    if (urlSpaceId) {
      setActiveSpaceId(urlSpaceId);
    }
  }, [urlSpaceId]);

  const fetchDocs = useCallback((spaceId?: string) => {
    setLoading(true);
    listDocs(spaceId)
      .then(res => setData(res.docs.map((doc: any) => ({ ...doc, id: doc.docId }))))
      .catch(() => message.error('加载文档列表失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDocs(activeSpaceId);
  }, [activeSpaceId, fetchDocs]);

  // 对 PENDING/PROCESSING 文档自动轮询状态
  useEffect(() => {
    const inProgressDocs = data.filter(d => d.status === 'PENDING' || d.status === 'PROCESSING');
    if (inProgressDocs.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    if (pollingRef.current) return;

    pollingRef.current = setInterval(async () => {
      const updates = await Promise.allSettled(
        inProgressDocs.map(doc => getDocStatus(doc.docId, doc.version))
      );
      let hasChange = false;
      setData(prev => {
        const next = prev.map(doc => {
          const idx = inProgressDocs.findIndex(d => d.docId === doc.docId && d.version === doc.version);
          if (idx === -1) return doc;
          const result = updates[idx];
          if (result.status === 'fulfilled' && result.value.status !== doc.status) {
            hasChange = true;
            return { ...doc, status: result.value.status };
          }
          return doc;
        });
        return hasChange ? next : prev;
      });
    }, 4000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [data]);

  const handleLUIAction = useCallback((action: LUIAction) => {
    if (action.type === 'NAVIGATE' && action.payload.path === '/documents') {
      message.success('已通过智能指令导航到文档列表');
    }
    if (action.type === 'CALL_SKILL') {
      const skillId = action.payload.skillId as string;
      if (skillId === 'skill-doc-status') {
        message.success('已调用「查询文档状态」技能');
      }
    }
  }, []);

  const handleDelete = (doc: DocSummary) => {
    modal.confirm({
      title: '确认删除',
      content: `确认永久删除文档「${doc.title}」吗？此操作不可撤销。`,
      okText: '确认删除',
      okButtonProps: { danger: true } as any,
      onOk: () => {
        return deleteDoc(doc.docId, doc.version)
          .then(() => {
            message.success(`文档「${doc.title}」已删除`);
            fetchDocs(activeSpaceId);
          })
          .catch(() => {
            message.error('删除失败');
          });
      },
    });
  };

  const handleRetry = (doc: DocSummary) => {
    modal.confirm({
      title: '确认重试',
      content: `确认重新触发文档「${doc.title}」的入库流程吗？`,
      onOk: async () => {
        setRetryingDocIds(prev => new Set(prev).add(doc.docId));
        try {
          await retryDoc(doc.docId, doc.version);
          message.success(`已重新触发文档「${doc.title}」的入库流程`);
          setData(prev => prev.map(d =>
            d.docId === doc.docId ? { ...d, status: 'PROCESSING' } : d
          ));
        } catch {
          message.error('重试失败，请稍后再试');
        } finally {
          setRetryingDocIds(prev => { const s = new Set(prev); s.delete(doc.docId); return s; });
        }
      },
    });
  };

  const handleBatchDelete = () => {
    const selectedDocs = data.filter((doc: any) => selectedRowKeys.includes(doc.id));
    modal.confirm({
      title: '确认批量删除',
      content: `确认永久删除选中的 ${selectedRowKeys.length} 个文档吗？此操作不可撤销。`,
      okText: '确认删除',
      okButtonProps: { danger: true } as any,
      onOk: () => {
        return Promise.all(selectedDocs.map((doc: any) => deleteDoc(doc.docId, doc.version)))
          .then(() => {
            message.success(`已删除 ${selectedRowKeys.length} 个文档`);
            setSelectedRowKeys([]);
            fetchDocs(activeSpaceId);
          })
          .catch(() => {
            message.error('部分文档删除失败');
          });
      },
    });
  };

  const columns: ColumnsType<DocSummary> = [
    {
      title: '文档名称',
      dataIndex: 'title',
      key: 'title',
      render: (title: string) => (
        <Text strong style={{ fontSize: 14 }}>{title}</Text>
      ),
    },
    {
      title: '文件类型',
      dataIndex: 'docType',
      key: 'docType',
      width: 110,
      render: (type: DocType) => <DocTypeBadge docType={type} />,
      filters: [
        { text: '制度', value: 'REGULATION' },
        { text: '政策', value: 'POLICY' },
        { text: '审计', value: 'AUDIT' },
        { text: '合同', value: 'CONTRACT' },
        { text: '手册', value: 'MANUAL' },
      ],
      onFilter: (value, record) => record.docType === value,
    },
    {
      title: '所属行业',
      dataIndex: 'bizDomain',
      key: 'bizDomain',
      width: 110,
      render: (biz: string) => <Tag color="blue">{biz}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: DocStatus) => <DocStatusBadge status={status} />,
      filters: [
        { text: '已上线', value: 'READY' },
        { text: '处理中', value: 'PROCESSING' },
        { text: '等待中', value: 'PENDING' },
        { text: '失败', value: 'FAILED' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: '上传者',
      dataIndex: 'ownerUid',
      key: 'ownerUid',
      width: 120,
      render: (uid: string) => <Text style={{ fontSize: 13 }}>{uid}</Text>,
    },
    {
      title: '上传时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      sorter: (a, b) => (a.createTime || '').localeCompare(b.createTime || ''),
      render: (time: string) => (
        <Text style={{ fontSize: 13 }}>
          {dayjs(time).format('YYYY-MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          <Tooltip title="查看详情">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => router.push(`/documents/${record.docId}`)} />
          </Tooltip>
          <Tooltip title="解析详情">
            <Button
              type="link"
              size="small"
              icon={<ClusterOutlined />}
              onClick={() => {
                setPipelineDoc(record);
                setPipelineModalOpen(true);
              }}
            />
          </Tooltip>
          {record.status === 'FAILED' && (
            <Tooltip title="重试入库">
              <Button
                type="link"
                size="small"
                icon={<ReloadOutlined />}
                loading={retryingDocIds.has(record.docId)}
                onClick={() => handleRetry(record)}
              />
            </Tooltip>
          )}
          <Tooltip title="删除">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const filteredData = data.filter((doc: DocSummary) => {
    const matchSearch =
      searchText === '' ||
      doc.title.toLowerCase().includes(searchText.toLowerCase()) ||
      doc.docId.toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || doc.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats computed from full data (unfiltered)
  const readyCount = data.filter(d => d.status === 'READY').length;
  const processingCount = data.filter(d => d.status === 'PENDING' || d.status === 'PROCESSING').length;
  const failedCount = data.filter(d => d.status === 'FAILED').length;

  const statCards = [
    { label: '全部文档', value: data.length, icon: <FileTextOutlined />, color: 'blue' },
    { label: '已上线', value: readyCount, icon: <CheckCircleOutlined />, color: 'green' },
    { label: '处理中', value: processingCount, icon: <SyncOutlined />, color: 'amber' },
    { label: '失败', value: failedCount, icon: <CloseCircleOutlined />, color: failedCount > 0 ? 'red' : 'gray' },
  ];

  const spaceOptions = [
    { label: '全部空间', value: '' },
    ...spaces.map(s => ({ label: s.name, value: s.id })),
  ];

  const emptyDescription = searchText || statusFilter !== 'ALL'
    ? '没有匹配的文档，请调整筛选条件'
    : activeSpaceId
      ? '该知识空间暂无文档，点击上方「上传文档」开始'
      : '知识库中暂无文档，点击上方「上传文档」开始';

  return (
    <AppLayout>
      <CommandBar onAction={handleLUIAction} />

      <PageHeader
        breadcrumbs={[
          { title: '知识库' },
          { title: '文档管理' },
        ]}
        title="文档管理"
        description="管理知识库中的所有文档，支持上传、查看、删除等操作"
        actions={
          <Space size={8}>
            <Button icon={<ReloadOutlined />} onClick={() => fetchDocs(activeSpaceId)}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} href="/documents/upload">
              上传文档
            </Button>
          </Space>
        }
      />

      {/* Stats Bar */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {statCards.map(s => (
          <div key={s.label} className={`stat-card-v2 stat-card-v2--${s.color}`}>
            <div className="stat-card-v2__icon">{s.icon}</div>
            <div className="stat-card-v2__content">
              <div className="stat-card-v2__label">{s.label}</div>
              <div className="stat-card-v2__number">{loading && data.length === 0 ? '—' : s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Unified Toolbar */}
      <Card style={{ borderRadius: 'var(--radius-lg)', marginBottom: 20 }}>
        <Row gutter={[12, 12]} align="middle" justify="space-between">
          <Col xs={24} sm={12} md={5}>
            <Select
              value={activeSpaceId || ''}
              onChange={(val) => setActiveSpaceId(val || undefined)}
              options={spaceOptions}
              style={{ width: '100%' }}
              placeholder="选择知识空间"
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Input
              placeholder="搜索文档名称或ID..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: '100%' }}
              options={[
                { label: '全部状态', value: 'ALL' },
                { label: '已上线', value: 'READY' },
                { label: '处理中', value: 'PROCESSING' },
                { label: '等待中', value: 'PENDING' },
                { label: '失败', value: 'FAILED' },
              ]}
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Segmented
              value={viewMode}
              onChange={(val) => setViewMode(val as 'list' | 'card')}
              options={[
                { label: '', value: 'list', icon: <UnorderedListOutlined /> },
                { label: '', value: 'card', icon: <AppstoreOutlined /> },
              ]}
            />
          </Col>
          <Col xs={0} md={4} style={{ textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              共 {filteredData.length} 条记录
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Content Area */}
      <Card style={{ borderRadius: 'var(--radius-lg)' }}>
        {filteredData.length === 0 ? (
          <div style={{ padding: '48px 0' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={emptyDescription}
            >
              {(searchText || statusFilter !== 'ALL') ? (
                <Button onClick={() => { setSearchText(''); setStatusFilter('ALL'); }}>
                  清除筛选
                </Button>
              ) : (
                <Button type="primary" icon={<PlusOutlined />} href="/documents/upload">
                  上传文档
                </Button>
              )}
            </Empty>
          </div>
        ) : viewMode === 'list' ? (
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
            scroll={{ x: 'max-content' }}
            size="middle"
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredData.map((doc) => {
              const tags = (doc.labelTags || '').split(',').filter(Boolean);
              const accentColor = STATUS_ACCENT[doc.status] || 'var(--color-border)';

              const sizeText = doc.fileSize
                ? doc.fileSize >= 1048576
                  ? `${(doc.fileSize / 1048576).toFixed(1)} MB`
                  : doc.fileSize >= 1024
                    ? `${(doc.fileSize / 1024).toFixed(0)} KB`
                    : `${doc.fileSize} B`
                : null;

              return (
                <Col key={doc.docId} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    hoverable
                    size="small"
                    onClick={() => router.push(`/documents/${doc.docId}`)}
                    style={{
                      borderRadius: 'var(--radius-lg)',
                      borderTop: `3px solid ${accentColor}`,
                      height: '100%',
                      overflow: 'hidden',
                    }}
                    styles={{ body: { padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' } }}
                  >
                    {/* Header: type + status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <DocTypeBadge docType={doc.docType} />
                      <DocStatusBadge status={doc.status as DocStatus} />
                    </div>

                    {/* Title */}
                    <Text
                      strong
                      style={{
                        fontSize: 14,
                        lineHeight: 1.5,
                        marginBottom: 12,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        flex: 1,
                      }}
                    >
                      {doc.title}
                    </Text>

                    {/* Meta */}
                    <div
                      style={{
                        background: 'var(--color-muted)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        marginBottom: 10,
                      }}
                    >
                      <Row gutter={[0, 6]}>
                        <Col span={12}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>行业</Text>
                          <Text style={{ fontSize: 13 }}>{doc.bizDomain}</Text>
                        </Col>
                        {sizeText && (
                          <Col span={12}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>大小</Text>
                            <Text style={{ fontSize: 13 }}>{sizeText}</Text>
                          </Col>
                        )}
                        <Col span={12}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>上传者</Text>
                          <Text style={{ fontSize: 13 }}>{doc.ownerUid}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>上传时间</Text>
                          <Text style={{ fontSize: 13 }}>
                            {doc.createTime ? dayjs(doc.createTime).format('MM-DD HH:mm') : '—'}
                          </Text>
                        </Col>
                      </Row>
                    </div>

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <Space size={4} wrap>
                          {tags.map((tag: string) => (
                            <Tag key={tag} style={{ fontSize: 10, margin: 0 }}>{tag}</Tag>
                          ))}
                        </Space>
                      </div>
                    )}

                    {/* Footer: actions */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      borderTop: '1px solid var(--color-border)',
                      paddingTop: 10,
                      marginTop: 'auto',
                    }}>
                      <Space size={0}>
                        <Tooltip title="查看详情">
                          <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={(e) => { e.stopPropagation(); router.push(`/documents/${doc.docId}`); }}
                          />
                        </Tooltip>
                        <Dropdown
                          menu={{
                            items: [
                              { key: 'view', label: '查看详情', icon: <EyeOutlined /> },
                              { key: 'pipeline', label: '解析详情', icon: <ClusterOutlined /> },
                              ...(doc.status === 'FAILED' ? [{ key: 'retry', label: '重试入库', icon: <ReloadOutlined /> }] : []),
                              { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
                            ],
                            onClick: ({ key, domEvent }) => {
                              domEvent.stopPropagation();
                              if (key === 'view') router.push(`/documents/${doc.docId}`);
                              if (key === 'pipeline') {
                                setPipelineDoc(doc);
                                setPipelineModalOpen(true);
                              }
                              if (key === 'retry') handleRetry(doc);
                              if (key === 'delete') handleDelete(doc);
                            },
                          }}
                          trigger={['click']}
                        >
                          <Button
                            type="text"
                            size="small"
                            icon={<MoreOutlined />}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Dropdown>
                      </Space>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}

        {/* Batch Actions */}
        {selectedRowKeys.length > 0 && (
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              background: 'var(--color-surface)',
              borderTop: '1px solid var(--color-border)',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              zIndex: 10,
            }}
          >
            <Text strong>已选择 {selectedRowKeys.length} 项</Text>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
              批量删除
            </Button>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => {
                const failedDocs = data.filter(d => selectedRowKeys.includes(d.docId) && d.status === 'FAILED');
                if (failedDocs.length === 0) { message.warning('所选文档中没有处于失败状态的文档'); return; }
                modal.confirm({
                  title: '批量重试',
                  content: `确认对 ${failedDocs.length} 个失败文档重新触发入库流程吗？`,
                  onOk: async () => {
                    const ids = new Set(failedDocs.map(d => d.docId));
                    setRetryingDocIds(prev => new Set([...prev, ...ids]));
                    await Promise.allSettled(failedDocs.map(d => retryDoc(d.docId, d.version)));
                    setData(prev => prev.map(d => ids.has(d.docId) ? { ...d, status: 'PROCESSING' } : d));
                    setRetryingDocIds(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
                    message.success(`已触发 ${failedDocs.length} 个文档的重试`);
                  },
                });
              }}
            >
              批量重试
            </Button>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>
              取消选择
            </Button>
          </div>
        )}
      </Card>

      {/* 文档详情弹窗 */}
      <Modal
        title="文档详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            关闭
          </Button>,
          <Button
            key="pipeline"
            icon={<ClusterOutlined />}
            onClick={() => {
              if (selectedDoc) {
                setPipelineDoc(selectedDoc);
                setPipelineModalOpen(true);
                setDetailModalOpen(false);
              }
            }}
          >
            查看解析详情
          </Button>,
          <Button
            key="retry"
            icon={<ReloadOutlined />}
            onClick={() => {
              message.success('已触发重试');
              setDetailModalOpen(false);
            }}
          >
            重新解析
          </Button>,
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            onClick={async () => {
              if (!selectedDoc) return;
              try {
                await deleteDoc(selectedDoc.docId, selectedDoc.version);
                message.success(`文档「${selectedDoc.title}」已删除`);
                setDetailModalOpen(false);
                fetchDocs(activeSpaceId);
              } catch (err) {
                message.error('删除失败');
              }
            }}
          >
            删除
          </Button>,
        ]}
        width={680}
      >
        {selectedDoc && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="文档ID" span={2}>
                <Text code>{selectedDoc.docId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="标题" span={2}>
                <Text strong>{selectedDoc.title}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                <DocTypeBadge docType={selectedDoc.docType} />
              </Descriptions.Item>
              <Descriptions.Item label="版本">v{selectedDoc.version}</Descriptions.Item>
              <Descriptions.Item label="密级">
                <SecLevelBadge level={selectedDoc.secLevel} />
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <DocStatusBadge status={selectedDoc.status as DocStatus} />
              </Descriptions.Item>
              <Descriptions.Item label="业务域">{selectedDoc.bizDomain}</Descriptions.Item>
              <Descriptions.Item label="适用地域">{selectedDoc.regionCode}</Descriptions.Item>
              <Descriptions.Item label="上传者">{selectedDoc.ownerUid}</Descriptions.Item>
              <Descriptions.Item label="所属部门">{selectedDoc.deptId}</Descriptions.Item>
              <Descriptions.Item label="生效日期">{selectedDoc.effectiveFrom}</Descriptions.Item>
              <Descriptions.Item label="失效日期">
                {selectedDoc.effectiveTo || '永久有效'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {selectedDoc.createTime}
              </Descriptions.Item>
              <Descriptions.Item label="S3 路径" span={2}>
                <Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                  {selectedDoc.srcPath}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>
                <Space>
                  {(selectedDoc.labelTags || '').split(',').filter(Boolean).map((tag: string) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>

      {/* 文件预览弹窗 */}
      {previewDoc && (
        <FilePreview
          docId={previewDoc.docId}
          version={previewDoc.version}
          filename={previewDoc.title}
          open={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
        />
      )}

      {/* 解析详情弹窗 */}
      <PipelineDetailModal
        doc={pipelineDoc}
        open={pipelineModalOpen}
        onClose={() => setPipelineModalOpen(false)}
      />
    </AppLayout>
  );
}

export default function DocumentListPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>}>
      <DocumentListContent />
    </Suspense>
  );
}

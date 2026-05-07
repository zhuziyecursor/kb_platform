'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Table,
  Card,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Typography,
  Badge,
  Modal,
  App,
  Descriptions,
  Tabs,
  Segmented,
  Row,
  Col,
  Dropdown,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  FolderOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  MoreOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DocStatus, SecLevel, DocType, KnowledgeSpace } from '@/types';
import { listSpaces } from '@/api/knowledge-space';
import { listDocs, deleteDoc, DocSummary } from '@/api/http-client';
import CommandBar from '@/components/LUI/CommandBar';
import FilePreview from '@/components/FilePreview';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { DocStatusBadge, DocTypeBadge, SecLevelBadge } from '@/components/StatusBadge';
import type { LUIAction } from '@/types';
import dayjs from 'dayjs';
import { useRouter, useSearchParams } from 'next/navigation';

const { Text } = Typography;

export default function DocumentListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSpaceId = searchParams.get('spaceId');
  const [data, setData] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [activeSpaceTab, setActiveSpaceTab] = useState<string>(urlSpaceId || 'ALL');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocStatus | 'ALL'>('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocSummary | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocSummary | null>(null);
  const { modal, message } = App.useApp();

  // 加载知识空间列表
  useEffect(() => {
    listSpaces().then(setSpaces).catch(() => message.error('加载知识空间失败'));
  }, []);

  // 同步 URL spaceId 参数到 activeSpaceTab
  useEffect(() => {
    if (urlSpaceId) {
      setActiveSpaceTab(urlSpaceId);
    }
  }, [urlSpaceId]);

  // 加载文档列表
  const fetchDocs = useCallback((spaceId?: string) => {
    setLoading(true);
    listDocs(spaceId)
      .then(res => setData(res.docs.map((doc: any) => ({ ...doc, id: doc.docId }))))
      .catch(() => message.error('加载文档列表失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDocs(activeSpaceTab === 'ALL' ? undefined : activeSpaceTab);
  }, [activeSpaceTab, fetchDocs]);

  // 切换知识空间 Tab 时重新加载
  const handleSpaceTabChange = (key: string) => {
    setActiveSpaceTab(key);
  };

  // LUI Action Handler
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
    const config = {
      title: '确认删除',
      content: `确认永久删除文档「${doc.title}」吗？此操作不可撤销。`,
      okText: '确认删除',
      okButtonProps: { danger: true } as any,
      onOk: () => {
        return deleteDoc(doc.docId, doc.version)
          .then(() => {
            message.success(`文档「${doc.title}」已删除`);
            fetchDocs();
          })
          .catch(() => {
            message.error('删除失败');
          });
      },
    };
    modal.confirm(config);
  };

  const handleMenuClick = (doc: DocSummary, key: string) => {
    if (key === 'view') {
      router.push(`/documents/${doc.docId}`);
    }
    if (key === 'retry') {
      modal.confirm({
        title: '确认重试',
        content: `确认重新触发文档「${doc.title}」的入库流程吗？`,
        onOk() {
          message.success(`已触发文档 ${doc.docId} 的重试流程`);
        },
      });
    }
    if (key === 'delete') {
      handleDelete(doc);
    }
  };

  const handleBatchDelete = () => {
    const selectedDocs = data.filter((doc: any) => selectedRowKeys.includes(doc.id));
    const config = {
      title: '确认批量删除',
      content: `确认永久删除选中的 ${selectedRowKeys.length} 个文档吗？此操作不可撤销。`,
      okText: '确认删除',
      okButtonProps: { danger: true } as any,
      onOk: () => {
        return Promise.all(selectedDocs.map((doc: any) => deleteDoc(doc.docId, doc.version)))
          .then(() => {
            message.success(`已删除 ${selectedRowKeys.length} 个文档`);
            setSelectedRowKeys([]);
            fetchDocs();
          })
          .catch(() => {
            message.error('部分文档删除失败');
          });
      },
    };
    modal.confirm(config);
  };

  const columns: ColumnsType<DocSummary> = [
    {
      title: '文档名称',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{title}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            ID: {record.docId} | v{record.version}
          </Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'docType',
      key: 'docType',
      width: 90,
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
      title: '密级',
      dataIndex: 'secLevel',
      key: 'secLevel',
      width: 80,
      render: (level: SecLevel) => <SecLevelBadge level={level} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: DocStatus) => <DocStatusBadge status={status} />,
      filters: [
        { text: '草稿', value: 'DRAFT' },
        { text: '等待中', value: 'PENDING' },
        { text: '处理中', value: 'PROCESSING' },
        { text: '已上线', value: 'READY' },
        { text: '失败', value: 'FAILED' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: '业务域',
      dataIndex: 'bizDomain',
      key: 'bizDomain',
      width: 100,
      render: (biz: string) => <Tag>{biz}</Tag>,
    },
    {
      title: '适用地域',
      dataIndex: 'regionCode',
      key: 'regionCode',
      width: 110,
      render: (region: string) => {
        const map: Record<string, string> = {
          'CN-NATIONAL': '全国',
          'CN-EAST': '华东',
          'CN-SOUTH': '华南',
          'CN-NORTH': '华北',
        };
        return <Text style={{ fontSize: 12 }}>{map[region] || region}</Text>;
      },
    },
    {
      title: '上传者',
      dataIndex: 'ownerUid',
      key: 'ownerUid',
      width: 120,
      render: (uid: string) => <Text type="secondary" style={{ fontSize: 12 }}>{uid}</Text>,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      sorter: (a, b) => (a.createTime || '').localeCompare(b.createTime || ''),
      render: (time: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(time).format('YYYY-MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleMenuClick(record, 'view')}>
            查看
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
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
          <>
            <Button icon={<ReloadOutlined />} onClick={() => fetchDocs(activeSpaceTab === 'ALL' ? undefined : activeSpaceTab)}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} href="/documents/upload">
              上传文档
            </Button>
          </>
        }
        extra={
          <Space style={{ marginTop: 16 }} size={12} wrap>
            <Input
              placeholder="搜索文档名称或ID..."
              prefix={<SearchOutlined />}
              style={{ width: 260 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 130 }}
              options={[
                { label: '全部状态', value: 'ALL' },
                { label: '已上线', value: 'READY' },
                { label: '处理中', value: 'PROCESSING' },
                { label: '等待中', value: 'PENDING' },
                { label: '失败', value: 'FAILED' },
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              共 {filteredData.length} 条记录
            </Text>
          </Space>
        }
      />

      <Card
        style={{ borderRadius: 'var(--radius-lg)' }}
      >
        {/* 知识空间 Tab */}
        <Tabs
          activeKey={activeSpaceTab}
          onChange={handleSpaceTabChange}
          tabBarExtraContent={
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => router.push('/spaces/create')}
            >
              新建空间
            </Button>
          }
          items={[
            {
              key: 'ALL',
              label: (
                <span>
                  全部 <Badge count={data.length} size="small" style={{ marginLeft: 4 }} />
                </span>
              ),
            },
            ...spaces.map(space => ({
              key: space.id,
              label: (
                <span>
                  <FolderOutlined style={{ marginRight: 4 }} />
                  {space.name} <Badge count={space.docCount || 0} size="small" style={{ marginLeft: 4 }} />
                </span>
              ),
            })),
          ]}
          style={{ marginBottom: 16 }}
        />

        {/* 视图切换 */}
        <Segmented
          value={viewMode}
          onChange={(val) => setViewMode(val as 'list' | 'card')}
          options={[
            { label: '列表', value: 'list', icon: <UnorderedListOutlined /> },
            { label: '卡片', value: 'card', icon: <AppstoreOutlined /> },
          ]}
        />

        {/* 列表 / 卡片视图 */}
        {viewMode === 'list' ? (
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

              return (
                <Col key={doc.docId} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    hoverable
                    size="small"
                    onClick={() => router.push(`/documents/${doc.docId}`)}
                    style={{ borderRadius: 10, height: '100%' }}
                    styles={{ body: { padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' } }}
                  >
                    {/* 头部：类型 + 状态 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <DocTypeBadge docType={doc.docType} />
                      <DocStatusBadge status={doc.status as DocStatus} />
                    </div>

                    {/* 标题 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, flex: 1 }}>
                      <FileTextOutlined style={{ color: 'var(--color-accent)', marginTop: 3, flexShrink: 0 }} />
                      <Text strong style={{ fontSize: 14, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {doc.title}
                      </Text>
                    </div>

                    {/* 元信息 */}
                    <div style={{ marginBottom: 8 }}>
                      <Space size={6} wrap>
                        <SecLevelBadge level={doc.secLevel} />
                        <Text type="secondary" style={{ fontSize: 12 }}>·</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{doc.bizDomain}</Text>
                      </Space>
                    </div>

                    {/* 标签 */}
                    {tags.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <Space size={4} wrap>
                          {tags.map((tag: string) => (
                            <Tag key={tag} style={{ fontSize: 10, margin: 0 }}>{tag}</Tag>
                          ))}
                        </Space>
                      </div>
                    )}

                    {/* 底部：时间 + 操作 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 'auto' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {doc.createTime ? dayjs(doc.createTime).format('MM-DD HH:mm') : '—'}
                      </Text>
                      <Space size={0}>
                        <Button
                          type="text"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={(e) => { e.stopPropagation(); router.push(`/documents/${doc.docId}`); }}
                        />
                        <Dropdown
                          menu={{
                            items: [
                              { key: 'view', label: '查看详情', icon: <EyeOutlined /> },
                              { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
                            ],
                            onClick: ({ key, domEvent }) => {
                              domEvent.stopPropagation();
                              if (key === 'view') router.push(`/documents/${doc.docId}`);
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
              )})}
          </Row>
        )}

        {/* 批量操作 */}
        {selectedRowKeys.length > 0 && (
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              background: 'var(--color-surface)',
              borderTop: '1px solid var(--color-border)',
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
              onClick={() => message.info('已触发批量重试')}
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
                fetchDocs();
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
    </AppLayout>
  );
}

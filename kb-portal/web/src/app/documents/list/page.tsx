'use client';

import React, { useState, useCallback } from 'react';
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
  Dropdown,
  Menu,
  Modal,
  message,
  Tooltip,
  Descriptions,
  Divider,
  Form,
  Tabs,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { KnowledgeDoc, DocStatus, SecLevel, DocType, KnowledgeSpace } from '@/types';
import { listSpaces } from '@/api/knowledge-space';
import CommandBar from '@/components/LUI/CommandBar';
import type { LUIAction } from '@/types';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;

// ============== Mock 数据 ==============
const MOCK_DOCUMENTS: KnowledgeDoc[] = [
  {
    id: '1',
    docId: 'DOC20260401001',
    tenantId: 'tenant-001',
    title: '2026年采购管理办法',
    version: 3,
    docType: 'REGULATION',
    sourceType: 'UPLOAD',
    srcPath: 's3://kb-raw/tenant-001/COMPLIANCE/2026/04/DOC20260401001/采购办法.pdf',
    sha256: 'a1b2c3d4e5f6...',
    ownerUid: 'user-zhangsan',
    deptId: 'D01',
    secLevel: 2,
    regionCode: 'CN-NATIONAL',
    bizDomain: 'COMPLIANCE',
    effectiveFrom: '2026-01-01',
    labelTags: ['采购', '合规', '2026'],
    status: 'READY',
    retryCount: 0,
    createTime: '2026-04-01 09:23:11',
  },
  {
    id: '2',
    docId: 'DOC20260415002',
    tenantId: 'tenant-001',
    title: '信息安全管理制度 V2',
    version: 2,
    docType: 'POLICY',
    sourceType: 'UPLOAD',
    srcPath: 's3://kb-raw/tenant-001/IT/2026/04/DOC20260415002/信息安全制度.docx',
    sha256: 'f6e5d4c3b2a1...',
    ownerUid: 'user-lisi',
    deptId: 'D02',
    secLevel: 3,
    regionCode: 'CN-NATIONAL',
    bizDomain: 'IT',
    effectiveFrom: '2026-04-15',
    labelTags: ['安全', '制度', 'IT'],
    status: 'PROCESSING',
    retryCount: 1,
    createTime: '2026-04-15 14:05:33',
  },
  {
    id: '3',
    docId: 'DOC20260422003',
    tenantId: 'tenant-001',
    title: 'HR 绩效考核操作手册',
    version: 1,
    docType: 'MANUAL',
    sourceType: 'UPLOAD',
    srcPath: 's3://kb-raw/tenant-001/HR/2026/04/DOC20260422003/绩效考核手册.pdf',
    sha256: '1a2b3c4d5e6f...',
    ownerUid: 'user-wangwu',
    deptId: 'D04',
    secLevel: 1,
    regionCode: 'CN-NATIONAL',
    bizDomain: 'HR',
    effectiveFrom: '2026-04-22',
    labelTags: ['HR', '绩效'],
    status: 'PENDING',
    retryCount: 0,
    createTime: '2026-04-22 10:12:07',
  },
  {
    id: '4',
    docId: 'DOC20260419004',
    tenantId: 'tenant-001',
    title: '2025年度审计报告（机密）',
    version: 1,
    docType: 'AUDIT',
    sourceType: 'UPLOAD',
    srcPath: 's3://kb-raw/tenant-001/COMPLIANCE/2026/04/DOC20260419004/审计报告.pdf',
    sha256: '9f8e7d6c5b4a...',
    ownerUid: 'user-zhaoliu',
    deptId: 'D03',
    secLevel: 4,
    regionCode: 'CN-NATIONAL',
    bizDomain: 'COMPLIANCE',
    effectiveFrom: '2026-04-19',
    labelTags: ['审计', '机密'],
    status: 'FAILED',
    retryCount: 3,
    lastError: 'TikaParser: 编码不支持，文件疑似损坏',
    createTime: '2026-04-19 16:45:22',
  },
  {
    id: '5',
    docId: 'DOC20260425005',
    tenantId: 'tenant-001',
    title: '合同审批流程指引',
    version: 5,
    docType: 'CONTRACT',
    sourceType: 'UPLOAD',
    srcPath: 's3://kb-raw/tenant-001/COMPLIANCE/2026/04/DOC20260425005/合同审批.docx',
    sha256: 'abc123def456...',
    ownerUid: 'user-zhangsan',
    deptId: 'D01',
    secLevel: 2,
    regionCode: 'CN-EAST',
    bizDomain: 'COMPLIANCE',
    effectiveFrom: '2026-04-25',
    labelTags: ['合同', '审批', '华东'],
    status: 'READY',
    retryCount: 0,
    createTime: '2026-04-25 11:30:00',
  },
];

const DOC_TYPE_MAP: Record<DocType, { label: string; color: string }> = {
  REGULATION: { label: '制度', color: 'blue' },
  POLICY: { label: '政策', color: 'cyan' },
  AUDIT: { label: '审计', color: 'orange' },
  CONTRACT: { label: '合同', color: 'purple' },
  MANUAL: { label: '手册', color: 'green' },
};

const STATUS_MAP: Record<DocStatus, { label: string; color: string; icon?: React.ReactNode }> = {
  DRAFT: { label: '草稿', color: 'default' },
  PENDING: { label: '等待中', color: 'gold', icon: <ClockCircleOutlined /> },
  PROCESSING: { label: '处理中', color: 'processing', icon: <SyncOutlined spin /> },
  READY: { label: '可检索', color: 'success', icon: <CheckCircleOutlined /> },
  FAILED: { label: '失败', color: 'error', icon: <CloseCircleOutlined /> },
};

const SEC_LEVEL_MAP: Record<number, { label: string; color: string }> = {
  1: { label: '🌍 公开', color: 'green' },
  2: { label: '🔒 内部', color: 'blue' },
  3: { label: '🔐 机密', color: 'orange' },
  4: { label: '🔒 秘密', color: 'red' },
  5: { label: '🛡️ 绝密', color: 'purple' },
};

export default function DocumentListPage() {
  const router = useRouter();
  const [data] = useState<KnowledgeDoc[]>(MOCK_DOCUMENTS);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [activeSpaceTab, setActiveSpaceTab] = useState<string>('ALL');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocStatus | 'ALL'>('ALL');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDoc | null>(null);

  // 加载知识空间列表
  useEffect(() => {
    // TODO: 替换为真实 API 调用
    // listSpaces().then(setSpaces).catch(() => message.error('加载知识空间失败'));
    setSpaces([
      { id: 'DEFAULT', tenantId: '_system', name: '默认空间', chunkSize: 512, overlapRatio: 10, chunkMode: 'HEAD_FIRST', visibility: 'TEAM', docCount: 3, createTime: '', updateTime: '' },
      { id: 'space-1', tenantId: 't1', name: '合规文档', description: '合规制度文件', chunkSize: 512, overlapRatio: 10, chunkMode: 'HEAD_FIRST', visibility: 'TEAM', docCount: 2, createTime: '', updateTime: '' },
    ]);
  }, []);

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

  const handleMenuClick = (doc: KnowledgeDoc, key: string) => {
    if (key === 'view') {
      setSelectedDoc(doc);
      setDetailModalOpen(true);
    }
    if (key === 'retry') {
      Modal.confirm({
        title: '确认重试',
        content: `确认重新触发文档「${doc.title}」的入库流程吗？`,
        onOk: () => message.success(`已触发文档 ${doc.docId} 的重试流程`),
      });
    }
    if (key === 'delete') {
      Modal.confirm({
        title: '确认删除',
        content: `确认永久删除文档「${doc.title}」吗？此操作不可撤销。`,
        okText: '确认删除',
        okButtonProps: { danger: true },
        onOk: () => message.success(`文档 ${doc.docId} 已删除`),
      });
    }
  };

  const columns: ColumnsType<KnowledgeDoc> = [
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
      render: (type: DocType) => (
        <Tag color={DOC_TYPE_MAP[type].color}>{DOC_TYPE_MAP[type].label}</Tag>
      ),
      filters: Object.entries(DOC_TYPE_MAP).map(([value, { label }]) => ({ text: label, value })),
      onFilter: (value, record) => record.docType === value,
    },
    {
      title: '密级',
      dataIndex: 'secLevel',
      key: 'secLevel',
      width: 90,
      render: (level: SecLevel) => (
        <Tag color={SEC_LEVEL_MAP[level].color}>{SEC_LEVEL_MAP[level].label}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: DocStatus) => (
        <Space>
          {STATUS_MAP[status].icon}
          <Tag color={STATUS_MAP[status].color}>{STATUS_MAP[status].label}</Tag>
        </Space>
      ),
      filters: Object.entries(STATUS_MAP).map(([value, { label }]) => ({
        text: label,
        value,
      })),
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
      sorter: (a, b) => a.createTime.localeCompare(b.createTime),
      render: (time: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(time).format('YYYY-MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              { key: 'view', label: '查看详情', icon: <EyeOutlined /> },
              ...(record.status === 'FAILED'
                ? [{ key: 'retry', label: '重新解析', icon: <ReloadOutlined /> }]
                : []),
              { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
            ],
            onClick: ({ key }) => handleMenuClick(record, key),
          }}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  const filteredData = data.filter((doc) => {
    const matchSearch =
      searchText === '' ||
      doc.title.toLowerCase().includes(searchText.toLowerCase()) ||
      doc.docId.toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || doc.status === statusFilter;
    // TODO: 后续接入真实数据后，knowledgeSpaceId 需要从 doc 中读取
    // const matchSpace = activeSpaceTab === 'ALL' || doc.knowledgeSpaceId === activeSpaceTab;
    return matchSearch && matchStatus;
  });

  return (
    <div style={{ padding: 24 }}>
      <CommandBar onAction={handleLUIAction} />

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>文档管理</Title>
            <Badge count={filteredData.length} style={{ backgroundColor: '#1677ff' }} />
          </Space>
        }
        style={{ borderRadius: 8 }}
        extra={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              href="/documents/upload"
            >
              上传文档
            </Button>
            <Button icon={<ReloadOutlined />}>刷新</Button>
          </Space>
        }
      >
        {/* 知识空间 Tab */}
        <Tabs
          activeKey={activeSpaceTab}
          onChange={setActiveSpaceTab}
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

        {/* 筛选栏 */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
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
              ...Object.entries(STATUS_MAP).map(([value, { label }]) => ({
                label,
                value,
              })),
            ]}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {filteredData.length} 条记录
          </Text>
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          scroll={{ x: 1200 }}
          size="middle"
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />

        {/* 批量操作 */}
        {selectedRowKeys.length > 0 && (
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              background: '#fff',
              borderTop: '1px solid #f0f0f0',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              zIndex: 10,
            }}
          >
            <Text strong>已选择 {selectedRowKeys.length} 项</Text>
            <Button size="small" danger icon={<DeleteOutlined />}>
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
            onClick={() => {
              message.success('已删除');
              setDetailModalOpen(false);
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
                <Tag color={DOC_TYPE_MAP[selectedDoc.docType].color}>
                  {DOC_TYPE_MAP[selectedDoc.docType].label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="版本">v{selectedDoc.version}</Descriptions.Item>
              <Descriptions.Item label="密级">
                <Tag color={SEC_LEVEL_MAP[selectedDoc.secLevel].color}>
                  {SEC_LEVEL_MAP[selectedDoc.secLevel].label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[selectedDoc.status].color}>
                  {STATUS_MAP[selectedDoc.status].label}
                </Tag>
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
              {selectedDoc.lastError && (
                <Descriptions.Item label="错误信息" span={2}>
                  <Text type="danger">{selectedDoc.lastError}</Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="标签" span={2}>
                <Space>
                  {selectedDoc.labelTags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
}

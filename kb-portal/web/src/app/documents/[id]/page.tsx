'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Space,
  Typography,
  Button,
  Breadcrumb,
  Spin,
  App,
} from 'antd';
import {
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  HomeOutlined,
  GlobalOutlined,
  LockOutlined,
  SafetyOutlined,
  SecurityScanOutlined,
  SafetyCertificateOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useRouter } from 'next/navigation';
import { getDoc, getDocStatus, deleteDoc, DocSummary } from '@/api/http-client';
import FilePreview from '@/components/FilePreview';
import AppLayout from '@/components/AppLayout';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const DOC_TYPE_MAP: Record<string, { label: string; color: string }> = {
  REGULATION: { label: '制度', color: 'blue' },
  POLICY: { label: '政策', color: 'cyan' },
  AUDIT: { label: '审计', color: 'orange' },
  CONTRACT: { label: '合同', color: 'purple' },
  MANUAL: { label: '手册', color: 'green' },
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: '草稿', color: 'default', icon: null },
  PENDING: { label: '等待中', color: 'gold', icon: <ClockCircleOutlined /> },
  PROCESSING: { label: '处理中', color: 'processing', icon: <SyncOutlined spin /> },
  READY: { label: '可检索', color: 'success', icon: <CheckCircleOutlined /> },
  FAILED: { label: '失败', color: 'error', icon: <CloseCircleOutlined /> },
};

const SEC_LEVEL_MAP: Record<number, { label: string; color: string; icon: React.ReactNode }> = {
  1: { label: '公开', color: 'green', icon: <GlobalOutlined /> },
  2: { label: '内部', color: 'blue', icon: <LockOutlined /> },
  3: { label: '机密', color: 'orange', icon: <SafetyOutlined /> },
  4: { label: '秘密', color: 'red', icon: <SecurityScanOutlined /> },
  5: { label: '绝密', color: 'purple', icon: <SafetyCertificateOutlined /> },
};

const REGION_MAP: Record<string, string> = {
  'CN-NATIONAL': '全国',
  'CN-EAST': '华东',
  'CN-SOUTH': '华南',
  'CN-NORTH': '华北',
};

const TERMINAL_STATUSES = ['READY', 'FAILED', 'DRAFT'];

export default function DocumentDetailPage() {
  const { id: docId } = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<DocSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { modal, message } = App.useApp();

  const fetchStatus = useCallback(async () => {
    if (!docId || !doc) return;
    try {
      const status = await getDocStatus(docId, doc.version);
      setDoc(prev => prev ? { ...prev, status: status.status } : prev);
    } catch {
      // ignore
    }
  }, [docId, doc]);

  useEffect(() => {
    if (!docId) return;
    getDoc(docId).then(d => {
      setDoc(d);
      setLoading(false);
    }).catch(() => {
      message.error('加载文档信息失败');
      setLoading(false);
    });
  }, [docId, message]);

  useEffect(() => {
    if (!doc || TERMINAL_STATUSES.includes(doc.status)) return;
    const timer = setInterval(fetchStatus, 3000);
    return () => clearInterval(timer);
  }, [doc, fetchStatus]);

  const handleDelete = () => {
    if (!doc) return;
    modal.confirm({
      title: '确认删除',
      content: `确认永久删除文档「${doc.title}」吗？此操作不可撤销。`,
      okText: '确认删除',
      okButtonProps: { danger: true } as any,
      onOk: () =>
        deleteDoc(doc.docId, doc.version)
          .then(() => {
            message.success(`文档「${doc.title}」已删除`);
            router.push('/documents/list');
          })
          .catch(() => message.error('删除失败')),
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </AppLayout>
    );
  }

  if (!doc) {
    return (
      <AppLayout>
        <Card>
          <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center', padding: 40 }}>
            <Title level={4} type="secondary">文档不存在</Title>
            <Text type="secondary">文档 {docId} 可能已被删除或无权访问</Text>
            <Button onClick={() => router.push('/documents/list')}>
              <ArrowLeftOutlined /> 返回文档列表
            </Button>
          </Space>
        </Card>
      </AppLayout>
    );
  }

  const statusInfo = STATUS_MAP[doc.status] || { label: doc.status, color: 'default' };
  const secInfo = SEC_LEVEL_MAP[doc.secLevel] || { label: `${doc.secLevel}`, color: 'default', icon: null };
  const typeInfo = DOC_TYPE_MAP[doc.docType] || { label: doc.docType, color: 'default' };

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { title: <><HomeOutlined /> 首页</>, href: '/' },
          { title: '文档管理', href: '/documents/list' },
          { title: doc.title },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>{doc.title}</Title>
            <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
            <Tag color={statusInfo.color}>
              {STATUS_MAP[doc.status]?.icon} {statusInfo.label}
            </Tag>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>
              文件预览
            </Button>
            {!TERMINAL_STATUSES.includes(doc.status) && (
              <Button icon={<ReloadOutlined />} onClick={fetchStatus}>
                刷新状态
              </Button>
            )}
            <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
              删除
            </Button>
          </Space>
        }
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="文档ID" span={2}>
            <Text code copyable>{doc.docId}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="版本">v{doc.version}</Descriptions.Item>
          <Descriptions.Item label="密级">
            <Space size={4}>
              {secInfo.icon}
              <Tag color={secInfo.color}>{secInfo.label}</Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Space>
              {STATUS_MAP[doc.status]?.icon}
              <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="业务域">{doc.bizDomain}</Descriptions.Item>
          <Descriptions.Item label="适用地域">
            {REGION_MAP[doc.regionCode] || doc.regionCode}
          </Descriptions.Item>
          <Descriptions.Item label="上传者">{doc.ownerUid}</Descriptions.Item>
          <Descriptions.Item label="所属部门">{doc.deptId}</Descriptions.Item>
          <Descriptions.Item label="生效日期">
            {doc.effectiveFrom || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="失效日期">
            {doc.effectiveTo || '永久有效'}
          </Descriptions.Item>
          <Descriptions.Item label="文件大小">
            {doc.fileSize != null ? `${(doc.fileSize / 1024).toFixed(1)} KB` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="知识空间">{doc.knowledgeSpaceId}</Descriptions.Item>
          <Descriptions.Item label="创建时间" span={2}>
            {doc.createTime ? dayjs(doc.createTime).format('YYYY-MM-DD HH:mm:ss') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="S3 路径" span={2}>
            <Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {doc.srcPath}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="标签" span={2}>
            {doc.labelTags
              ? (
                <Space>
                  {doc.labelTags.split(',').filter(Boolean).map((tag: string) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Space>
              )
              : <Text type="secondary">暂无标签</Text>
            }
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <FilePreview
        docId={doc.docId}
        version={doc.version}
        filename={doc.title}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </AppLayout>
  );
}

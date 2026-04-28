'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Badge,
  Modal,
  message,
  Popconfirm,
  Layout,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  SettingOutlined,
  FileTextOutlined,
  CloudUploadOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { KnowledgeSpace } from '@/types';
import { listSpaces, deleteSpace } from '@/api/knowledge-space';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

const NAV_ITEMS = [
  { key: 'home', icon: <FileTextOutlined />, label: '知识库', path: '/' },
  { key: 'spaces', icon: <FolderOutlined />, label: '知识空间', path: '/spaces/list' },
  { key: 'docs', icon: <FileTextOutlined />, label: '文档管理', path: '/documents/list' },
  { key: 'upload', icon: <CloudUploadOutlined />, label: '上传文档', path: '/documents/upload' },
  { key: 'chat', icon: <RobotOutlined />, label: '知识问答', path: '/rag' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置', path: '/settings' },
];

const CHUNK_MODE_MAP: Record<string, { label: string; color: string }> = {
  HEAD_FIRST: { label: '从前到后', color: 'blue' },
  TAIL_FIRST: { label: '从后到前', color: 'cyan' },
  UNIFORM: { label: '均匀切分', color: 'purple' },
};

const VISIBILITY_MAP: Record<string, { label: string; color: string }> = {
  PUBLIC: { label: '公开', color: 'green' },
  TEAM: { label: '团队内', color: 'blue' },
};

export default function SpaceListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSpaces = async () => {
    setLoading(true);
    try {
      const data = await listSpaces();
      setSpaces(data);
    } catch {
      message.error('加载知识空间失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpaces();
  }, []);

  const handleDelete = async (space: KnowledgeSpace) => {
    if (space.id === 'DEFAULT') {
      message.error('默认空间无法删除');
      return;
    }
    try {
      await deleteSpace(space.id);
      message.success(`知识空间「${space.name}」已删除`);
      fetchSpaces();
    } catch {
      message.error('删除失败，请确保空间内没有文档');
    }
  };

  const columns: ColumnsType<KnowledgeSpace> = [
    {
      title: '知识空间',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            <FolderOutlined style={{ color: '#1677ff' }} />
            <Text strong>{name}</Text>
            {record.id === 'DEFAULT' && <Tag>默认</Tag>}
          </Space>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '切片配置',
      key: 'chunkConfig',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>
            段长度: <Text code>{record.chunkSize}</Text> 字符
          </Text>
          <Text style={{ fontSize: 12 }}>
            重叠率: <Text code>{record.overlapRatio}%</Text>
          </Text>
        </Space>
      ),
    },
    {
      title: '切片模式',
      dataIndex: 'chunkMode',
      key: 'chunkMode',
      width: 100,
      render: (mode: string) => (
        <Tag color={CHUNK_MODE_MAP[mode]?.color}>{CHUNK_MODE_MAP[mode]?.label}</Tag>
      ),
    },
    {
      title: '可见范围',
      dataIndex: 'visibility',
      key: 'visibility',
      width: 100,
      render: (vis: string) => (
        <Tag color={VISIBILITY_MAP[vis]?.color}>{VISIBILITY_MAP[vis]?.label}</Tag>
      ),
    },
    {
      title: '文档数',
      dataIndex: 'docCount',
      key: 'docCount',
      width: 80,
      render: (count?: number) => (
        <Badge count={count} showZero />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => router.push(`/spaces/${record.id}`)}
          >
            编辑
          </Button>
          {record.id !== 'DEFAULT' && (
            <Popconfirm
              title="确认删除"
              description={`确认删除知识空间「${record.name}」吗？删除后无法恢复。`}
              onConfirm={() => handleDelete(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 左侧导航 */}
      <Sider
        width={200}
        style={{
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
          position: 'fixed',
          height: '100vh',
          left: 0,
          top: 0,
        }}
      >
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Title level={5} style={{ margin: 0, color: '#1677ff' }}>
            KB Platform
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>企业AI知识库</Text>
        </div>

        <div style={{ padding: '12px 8px' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === 'spaces';
            return (
              <Link key={item.key} href={item.path}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    color: isActive ? '#1677ff' : '#595959',
                    background: isActive ? '#e6f4ff' : 'transparent',
                    marginBottom: 4,
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <Text style={{ fontSize: 14 }}>{item.label}</Text>
                </div>
              </Link>
            );
          })}
        </div>
      </Sider>

      {/* 主内容区 */}
      <Content style={{ marginLeft: 200, padding: '32px 48px' }}>
        <Card
          title={
            <Space>
              <SettingOutlined />
              <Title level={4} style={{ margin: 0 }}>知识空间管理</Title>
            </Space>
          }
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/spaces/create')}>
              新建知识空间
            </Button>
          }
        >
          <Table
            columns={columns}
            dataSource={spaces}
            rowKey="id"
            loading={loading}
            pagination={false}
          />
        </Card>
      </Content>
    </Layout>
  );
}
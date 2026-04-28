'use client';

import React, { useCallback } from 'react';
import {
  Layout,
  Card,
  Typography,
  Row,
  Col,
  message,
} from 'antd';
import {
  CloudUploadOutlined,
  FileTextOutlined,
  RobotOutlined,
  FolderOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import type { LUIAction } from '@/types';

const { Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const NAV_ITEMS = [
  { key: 'home', icon: <FileTextOutlined />, label: '知识库', path: '/' },
  { key: 'spaces', icon: <FolderOutlined />, label: '知识空间', path: '/spaces' },
  { key: 'docs', icon: <FileTextOutlined />, label: '文档管理', path: '/documents/list' },
  { key: 'upload', icon: <CloudUploadOutlined />, label: '上传文档', path: '/documents/upload' },
  { key: 'chat', icon: <RobotOutlined />, label: '知识问答', path: '/rag' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置', path: '/settings' },
];

export default function HomePage() {
  const handleLUIAction = useCallback((action: LUIAction) => {
    if (action.type === 'CALL_SKILL') {
      message.success(`已调用技能: ${action.payload.skillId}`);
    }
  }, []);

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
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
            ZZY KB Platform
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>企业AI知识库</Text>
        </div>

        <div style={{ padding: '12px 8px' }}>
          {NAV_ITEMS.map((item) => (
            <Link key={item.key} href={item.path}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: item.key === 'home' ? '#1677ff' : '#595959',
                  background: item.key === 'home' ? '#e6f4ff' : 'transparent',
                  marginBottom: 4,
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <Text style={{ fontSize: 14 }}>{item.label}</Text>
              </div>
            </Link>
          ))}
        </div>
      </Sider>

      {/* 主内容区 */}
      <Content style={{ marginLeft: 200, padding: '32px 48px' }}>
        {/* 顶部欢迎区 */}
        <div style={{ marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 4 }}>欢迎使用企业AI知识库</Title>
          <Paragraph type="secondary">
            文档上传后 5 分钟内可检索，返回带引用的可信答案
          </Paragraph>
        </div>

        {/* 快捷操作 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
          <Col span={8}>
            <Link href="/documents/upload">
              <Card
                hoverable
                style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  borderRadius: 12,
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: '#e6f4ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <CloudUploadOutlined style={{ fontSize: 24, color: '#1677ff' }} />
                </div>
                <Text strong style={{ fontSize: 15 }}>上传文档</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>PDF/Word/PPT/Excel</Text>
              </Card>
            </Link>
          </Col>

          <Col span={8}>
            <Link href="/spaces">
              <Card
                hoverable
                style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  borderRadius: 12,
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: '#f6ffed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <FolderOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                </div>
                <Text strong style={{ fontSize: 15 }}>知识空间</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>管理文档与切片规则</Text>
              </Card>
            </Link>
          </Col>

          <Col span={8}>
            <Link href="/rag">
              <Card
                hoverable
                style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  borderRadius: 12,
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: '#f9f0ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <RobotOutlined style={{ fontSize: 24, color: '#722ed1' }} />
                </div>
                <Text strong style={{ fontSize: 15 }}>知识问答</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>RAG 带引用溯源</Text>
              </Card>
            </Link>
          </Col>
        </Row>

        {/* 快捷入口 */}
        <Card
          title={<Text strong>快捷入口</Text>}
          style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: '16px 24px' } }}
        >
          <Row gutter={[24, 12]}>
            <Col span={6}>
              <Link href="/documents/list">
                <Text style={{ color: '#1677ff', cursor: 'pointer' }}>📄 文档列表</Text>
              </Link>
            </Col>
            <Col span={6}>
              <Link href="/spaces/create">
                <Text style={{ color: '#1677ff', cursor: 'pointer' }}>➕ 新建知识空间</Text>
              </Link>
            </Col>
            <Col span={6}>
              <Link href="/documents/upload">
                <Text style={{ color: '#1677ff', cursor: 'pointer' }}>📤 继续上传</Text>
              </Link>
            </Col>
            <Col span={6}>
              <Link href="/rag">
                <Text style={{ color: '#1677ff', cursor: 'pointer' }}>💬 开始问答</Text>
              </Link>
            </Col>
          </Row>
        </Card>
      </Content>
    </Layout>
  );
}

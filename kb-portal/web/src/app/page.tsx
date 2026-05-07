'use client';

import {
  Card,
  Typography,
  Row,
  Col,
} from 'antd';
import {
  CloudUploadOutlined,
  RobotOutlined,
  FolderOutlined,
  FileTextOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';

const { Title, Text, Paragraph } = Typography;

const iconBoxStyle = (bgColor: string): React.CSSProperties => ({
  width: 48,
  height: 48,
  borderRadius: 'var(--radius-lg)',
  background: bgColor,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 16px',
});

export default function HomePage() {
  return (
    <AppLayout>
      {/* 顶部欢迎区 */}
      <div style={{ marginBottom: 'var(--space-12)' }}>
        <Title level={2} style={{ marginBottom: 'var(--space-2)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
          欢迎使用知识智库
        </Title>
        <Paragraph style={{ color: 'var(--color-secondary)', fontSize: 'var(--font-size-base)', marginBottom: 0 }}>
          文档上传后 5 分钟内可检索，返回带引用的可信答案
        </Paragraph>
      </div>

      {/* 快捷操作 */}
      <Row gutter={[20, 20]} style={{ marginBottom: 'var(--space-12)' }}>
        <Col xs={24} sm={12} lg={8}>
          <Link href="/documents/upload">
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
              styles={{ body: { padding: '28px 20px' } }}
            >
              <div style={iconBoxStyle('rgba(37, 99, 235, 0.08)')}>
                <CloudUploadOutlined style={{ fontSize: 24, color: 'var(--color-accent)' }} />
              </div>
              <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>上传文档</Text>
              <Text style={{ fontSize: 13, color: 'var(--color-secondary)' }}>PDF / Word / PPT / Excel</Text>
            </Card>
          </Link>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Link href="/spaces/list">
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
              styles={{ body: { padding: '28px 20px' } }}
            >
              <div style={iconBoxStyle('rgba(22, 163, 74, 0.08)')}>
                <FolderOutlined style={{ fontSize: 24, color: 'var(--color-success)' }} />
              </div>
              <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>知识空间</Text>
              <Text style={{ fontSize: 13, color: 'var(--color-secondary)' }}>管理文档与切片规则</Text>
            </Card>
          </Link>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Link href="/rag">
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
              styles={{ body: { padding: '28px 20px' } }}
            >
              <div style={iconBoxStyle('rgba(71, 85, 105, 0.08)')}>
                <RobotOutlined style={{ fontSize: 24, color: 'var(--color-primary)' }} />
              </div>
              <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>知识问答</Text>
              <Text style={{ fontSize: 13, color: 'var(--color-secondary)' }}>RAG 带引用溯源</Text>
            </Card>
          </Link>
        </Col>
      </Row>

      {/* 快捷入口 */}
      <Card
        title={<Text strong style={{ fontSize: 16 }}>快捷入口</Text>}
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-xs)',
        }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <Row gutter={[24, 16]}>
          <Col xs={12} sm={6}>
            <Link href="/documents/list" className="quick-link">
              <FileTextOutlined />
              <span>文档列表</span>
            </Link>
          </Col>
          <Col xs={12} sm={6}>
            <Link href="/spaces/create" className="quick-link">
              <PlusOutlined />
              <span>新建知识空间</span>
            </Link>
          </Col>
          <Col xs={12} sm={6}>
            <Link href="/documents/upload" className="quick-link">
              <CloudUploadOutlined />
              <span>继续上传</span>
            </Link>
          </Col>
          <Col xs={12} sm={6}>
            <Link href="/rag" className="quick-link">
              <RobotOutlined />
              <span>开始问答</span>
            </Link>
          </Col>
        </Row>
      </Card>
    </AppLayout>
  );
}

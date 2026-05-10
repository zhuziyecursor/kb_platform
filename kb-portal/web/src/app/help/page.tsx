'use client';

import React from 'react';
import { Card, Typography, List, Tag, Avatar, Space, Divider } from 'antd';
import {
  BulbOutlined,
  BugOutlined,
  RocketOutlined,
  MessageOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';

const { Title, Text, Paragraph } = Typography;

const faqData = [
  {
    q: '如何上传文档？',
    a: '在工作台页面，点击"上传文档"按钮，选择要上传的文件即可。支持 PDF、Word、PPT 等格式。',
  },
  {
    q: '文档处理需要多长时间？',
    a: '一般情况下，文档在 5 分钟内完成处理。较大文件可能需要更长时间。',
  },
  {
    q: '如何创建知识空间？',
    a: '进入"知识空间"页面，点击"创建空间"按钮，填写空间名称和描述即可。',
  },
  {
    q: '如何进行知识问答？',
    a: '点击左侧"知识问答"菜单，在输入框中输入问题，系统会从已处理的文档中寻找答案。',
  },
];

const announcementsData = [
  {
    id: 1,
    title: '系统升级通知',
    content: '系统将于本周六凌晨 2:00-4:00 进行升级维护，届时服务可能短暂中断。',
    time: '2024-01-15',
    type: 'warning',
  },
  {
    id: 2,
    title: '新功能上线：智能分片',
    content: '知识库新增智能分片功能，可以更精准地理解文档结构，提升检索质量。',
    time: '2024-01-10',
    type: 'success',
  },
  {
    id: 3,
    title: '性能优化通知',
    content: '已完成数据库索引优化，检索速度提升 30%。',
    time: '2024-01-05',
    type: 'info',
  },
];

const feedbackTypes = [
  { icon: <BulbOutlined />, label: '功能建议', color: '#1890ff' },
  { icon: <BugOutlined />, label: '问题反馈', color: '#ff4d4f' },
  { icon: <RocketOutlined />, label: '体验优化', color: '#52c41a' },
  { icon: <MessageOutlined />, label: '其他咨询', color: '#faad14' },
];

export default function HelpPage() {
  return (
    <AppLayout>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Title level={3} style={{ marginBottom: 24 }}>帮助与反馈</Title>

        <Title level={5}>反馈类型</Title>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {feedbackTypes.map((item) => (
            <Card
              key={item.label}
              hoverable
              style={{ textAlign: 'center', cursor: 'pointer' }}
              bodyStyle={{ padding: 24 }}
            >
              <Avatar
                size={48}
                icon={item.icon}
                style={{ background: item.color, marginBottom: 12 }}
              />
              <div style={{ color: 'var(--color-foreground)', fontWeight: 500 }}>
                {item.label}
              </div>
            </Card>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Card title="常见问题">
            <List
              dataSource={faqData}
              renderItem={(item) => (
                <List.Item style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '12px 0' }}>
                  <Text strong style={{ color: 'var(--color-accent)', marginBottom: 8 }}>
                    Q: {item.q}
                  </Text>
                  <Text type="secondary">
                    A: {item.a}
                  </Text>
                </List.Item>
              )}
            />
          </Card>

          <Card title="系统公告">
            <List
              dataSource={announcementsData}
              renderItem={(item) => (
                <List.Item style={{ padding: '12px 0' }}>
                  <List.Item.Meta
                    avatar={<ClockCircleOutlined style={{ color: 'var(--color-secondary)' }} />}
                    title={
                      <Space>
                        <Text strong>{item.title}</Text>
                        <Tag color={
                          item.type === 'warning' ? 'orange' :
                          item.type === 'success' ? 'green' : 'blue'
                        }>
                          {item.type === 'warning' ? '维护' :
                           item.type === 'success' ? '更新' : '通知'}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <Paragraph type="secondary" style={{ marginBottom: 4 }}>
                          {item.content}
                        </Paragraph>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.time}
                        </Text>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </div>

        <Card style={{ marginTop: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={5}>联系我们</Title>
            <Space size="large">
              <div>
                <Text type="secondary">技术支持邮箱：</Text>
                <Text>support@kbplatform.com</Text>
              </div>
              <Divider type="vertical" />
              <div>
                <Text type="secondary">客服热线：</Text>
                <Text>400-888-8888</Text>
              </div>
              <Divider type="vertical" />
              <div>
                <Text type="secondary">工作时间：</Text>
                <Text>9:00 - 18:00 (工作日)</Text>
              </div>
            </Space>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
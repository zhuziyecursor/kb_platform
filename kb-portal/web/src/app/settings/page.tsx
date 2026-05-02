'use client';

import React from 'react';
import {
  Card,
  Typography,
  Space,
  Descriptions,
  Tag,
  Divider,
  Switch,
  Select,
  Button,
  App,
} from 'antd';
import {
  SettingOutlined,
  UserOutlined,
  ApiOutlined,
  InfoCircleOutlined,
  BgColorsOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';
import { useTheme } from '@/components/ThemeProvider';

const { Title, Text } = Typography;

export default function SettingsPage() {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();
  const { message } = App.useApp();

  return (
    <AppLayout>
      <div style={{ marginBottom: 24 }}>
        <Space>
          <SettingOutlined style={{ fontSize: 22, color: 'var(--color-primary)' }} />
          <Title level={4} style={{ margin: 0 }}>系统设置</Title>
        </Space>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card title={<><UserOutlined /> 个人设置</>}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="用户名">
              <Text strong>
                {(typeof window !== 'undefined' && sessionStorage.getItem('username')) || 'admin'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="角色">
              <Tag color="blue">
                {(typeof window !== 'undefined' && sessionStorage.getItem('roleLabel')) || '管理员'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="登录方式">
              <Tag>OAuth2 / OBO Token</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={<><BgColorsOutlined /> 外观设置</>}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="主题模式">
              <Select
                value={themeMode}
                onChange={(val) => setThemeMode(val)}
                style={{ width: 150 }}
                options={[
                  { label: '随系统', value: 'system' },
                  { label: '浅色模式', value: 'light' },
                  { label: '深色模式', value: 'dark' },
                ]}
              />
            </Descriptions.Item>
            <Descriptions.Item label="当前生效">
              <Tag color={resolvedTheme === 'dark' ? 'purple' : 'gold'}>
                {resolvedTheme === 'dark' ? '深色' : '浅色'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={<><ApiOutlined /> 连接配置</>}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="网关地址">
              <Text code>{process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8081'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="认证方式">
              <Tag>Bearer JWT (OBO)</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Token 有效期">
              <Text>5 分钟</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={<><InfoCircleOutlined /> 系统信息</>}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="平台版本">
              <Tag>MVP v1.0.0</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="前端框架">
              <Text>Next.js + Ant Design</Text>
            </Descriptions.Item>
            <Descriptions.Item label="后端框架">
              <Text>Spring Boot 3.2 + Kafka</Text>
            </Descriptions.Item>
            <Descriptions.Item label="嵌入模型">
              <Text code>BGE-zh-v1.5</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Space>
    </AppLayout>
  );
}

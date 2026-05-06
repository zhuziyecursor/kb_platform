'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, App, Select } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;

const VALID_USERNAME = 'admin';
const VALID_PASSWORD = 'admin123';

const ROLE_OPTIONS = [
  { label: '超级管理员', value: 'super_admin' },
  { label: '迎审角色', value: 'audit' },
  { label: '计划员', value: 'planner' },
  { label: '普通用户', value: 'user' },
];

export default function LoginPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: { username: string; password: string; role: string }) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    if (values.username === VALID_USERNAME && values.password === VALID_PASSWORD) {
      document.cookie = 'isLoggedIn=true; path=/; max-age=86400';
      sessionStorage.setItem('username', values.username);
      sessionStorage.setItem('role', values.role);
      sessionStorage.setItem('roleLabel', ROLE_OPTIONS.find(r => r.value === values.role)?.label || '');
      message.success('登录成功');
      router.push('/');
    } else {
      message.error('用户名或密码错误');
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Subtle geometric decoration */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        right: '-10%',
        width: '60%',
        height: '70%',
        background: 'radial-gradient(circle, rgba(37, 99, 235, 0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'fixed',
        bottom: '-15%',
        left: '-5%',
        width: '50%',
        height: '60%',
        background: 'radial-gradient(circle, rgba(71, 85, 105, 0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <Card
        style={{
          width: 400,
          maxWidth: 'calc(100vw - 48px)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--color-border)',
          position: 'relative',
          zIndex: 1,
        }}
        styles={{ body: { padding: '40px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Title level={2} style={{ marginBottom: 8, color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
            企业AI知识库
          </Title>
          <Text style={{ color: 'var(--color-secondary)', fontSize: 14 }}>KB Platform</Text>
        </div>

        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="账号: admin"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码: admin123"
            />
          </Form.Item>

          <Form.Item
            name="role"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              prefix={<IdcardOutlined />}
              placeholder="请选择角色"
              options={ROLE_OPTIONS}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 28 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

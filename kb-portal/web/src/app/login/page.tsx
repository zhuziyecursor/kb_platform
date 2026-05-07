'use client';

import React, { useState } from 'react';
import { Form, Input, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { Button, Badge } from '@/components/ui';

const { Title, Text } = Typography;

const VALID_USERNAME = 'admin';
const VALID_PASSWORD = 'admin123';

const ROLES = [
  {
    id: 'super_admin',
    name: '超级管理员',
    description: '拥有系统全部权限，可管理所有模块',
    icon: '🛡️',
    color: '#DC2626',
  },
  {
    id: 'audit',
    name: '迎审角色',
    description: '准备审计材料，受限访问权限',
    icon: '📋',
    color: '#2563EB',
  },
  {
    id: 'planner',
    name: '计划员',
    description: '制定审计计划，管理审计资源',
    icon: '📝',
    color: '#16A34A',
  },
  {
    id: 'user',
    name: '普通用户',
    description: '仅限知识问答查询功能',
    icon: '👤',
    color: '#64748B',
  },
];

export default function LoginPage() {
  const { message } = App.useApp();
  const [step, setStep] = useState<'login' | 'role'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      message.error('请输入账号和密码');
      return;
    }
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      setStep('role');
    } else {
      message.error('用户名或密码错误');
    }
  };

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId);
  };

  const handleEnter = async () => {
    if (!selectedRole) {
      message.error('请选择一个角色');
      return;
    }
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    document.cookie = 'isLoggedIn=true; path=/; max-age=86400';
    sessionStorage.setItem('username', username);
    sessionStorage.setItem('role', selectedRole);
    sessionStorage.setItem('roleLabel', ROLES.find(r => r.id === selectedRole)?.name || '');
    message.success('登录成功');
    router.push('/');
  };

  // Role selection step
  if (step === 'role') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, var(--color-background) 0%, var(--color-muted) 100%)',
          fontFamily: 'var(--font-sans)',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 800, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <Title level={2} style={{ marginBottom: 8, color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
              选择您的角色
            </Title>
            <Text style={{ color: 'var(--color-secondary)', fontSize: 14 }}>
              不同的角色拥有不同的访问权限
            </Text>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            marginBottom: 32,
          }}>
            {ROLES.map((role) => (
              <button
                key={role.id}
                onClick={() => handleRoleSelect(role.id)}
                className="hover-card"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: selectedRole === role.id
                    ? `linear-gradient(135deg, ${role.color}15 0%, ${role.color}08 100%)`
                    : 'var(--color-surface)',
                  border: `2px solid ${selectedRole === role.id ? role.color : 'var(--color-border)'}`,
                  borderRadius: 16,
                  padding: 24,
                  cursor: 'pointer',
                  transition: 'all var(--transition-base)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 32 }}>{role.icon}</span>
                  {selectedRole === role.id && (
                    <CheckCircleFilled style={{ color: role.color, fontSize: 20 }} />
                  )}
                </div>
                <div>
                  <Title level={5} style={{ margin: 0, color: 'var(--color-foreground)' }}>
                    {role.name}
                  </Title>
                  <Text style={{ color: 'var(--color-secondary)', fontSize: 13 }}>
                    {role.description}
                  </Text>
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <Button
              variant="outline"
              onClick={() => {
                setStep('login');
                setSelectedRole(null);
              }}
            >
              返回登录
            </Button>
            <Button
              variant="primary"
              onClick={handleEnter}
              loading={loading}
              disabled={!selectedRole}
            >
              进入系统
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Login step
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, var(--color-background) 0%, var(--color-muted) 100%)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Background decorations */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        right: '-10%',
        width: '60%',
        height: '70%',
        background: 'radial-gradient(circle, rgba(37, 99, 235, 0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'fixed',
        bottom: '-15%',
        left: '-5%',
        width: '50%',
        height: '60%',
        background: 'radial-gradient(circle, rgba(71, 85, 105, 0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <Card
        style={{
          width: 420,
          maxWidth: 'calc(100vw - 48px)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--color-border)',
          position: 'relative',
          zIndex: 1,
        }}
        styles={{ body: { padding: '40px 32px' } }}
      >
        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 32,
        }}>
          <div style={{
            width: 48,
            height: 48,
            background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.3)',
          }}>
            <span style={{ fontSize: 24 }}>📚</span>
          </div>
          <div>
            <Title level={3} style={{ margin: 0, color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
              知识智库
            </Title>
            <Text style={{ color: 'var(--color-secondary)', fontSize: 12 }}>
              企业级 AI 知识管理平台
            </Text>
          </div>
        </div>

        {/* Login form */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)' }}>
            用户名
          </label>
          <Input
            size="large"
            prefix={<UserOutlined style={{ color: 'var(--color-secondary)' }} />}
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onPressEnter={handleLogin}
            style={{ borderRadius: 12 }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)' }}>
            密码
          </label>
          <Input.Password
            size="large"
            prefix={<LockOutlined style={{ color: 'var(--color-secondary)' }} />}
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onPressEnter={handleLogin}
            style={{ borderRadius: 12 }}
          />
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={handleLogin}
          style={{ width: '100%', marginTop: 8 }}
        >
          继续
        </Button>
      </Card>
    </div>
  );
}

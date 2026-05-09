'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Typography, Avatar, Dropdown, Tooltip, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  FileTextOutlined,
  FolderOutlined,
  RobotOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  AppstoreOutlined,
  MoreOutlined,
  QuestionCircleOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

const NAV_ITEMS = [
  { key: 'home', icon: <FileTextOutlined />, label: '工作台', path: '/' },
  { key: 'spaces', icon: <FolderOutlined />, label: '知识空间', path: '/spaces/list' },
  { key: 'chat', icon: <RobotOutlined />, label: '知识问答', path: '/rag' },
  { key: 'extensions', icon: <AppstoreOutlined />, label: '扩展管理', path: '/extensions' },
];

const SIDEBAR_WIDTH = 200;
const SIDEBAR_COLLAPSED_WIDTH = 64;

interface AppLayoutProps {
  children: React.ReactNode;
  contentStyle?: React.CSSProperties;
}

export default function AppLayout({ children, contentStyle }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { themeMode } = useTheme();
  const [username, setUsername] = useState('admin');
  const [roleLabel, setRoleLabel] = useState('管理员');

  useEffect(() => {
    setUsername(sessionStorage.getItem('username') || 'admin');
    setRoleLabel(sessionStorage.getItem('roleLabel') || '管理员');
  }, []);

  // Auto-collapse on narrow screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setCollapsed(e.matches);
    setCollapsed(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleLogout = () => {
    document.cookie = 'isLoggedIn=; path=/; max-age=0';
    sessionStorage.clear();
    router.push('/login');
  };

  const isActive = (itemKey: string) => {
    if (itemKey === 'home') return pathname === '/';
    return pathname.startsWith(`/${itemKey}`);
  };

  const currentWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  const userMenuItems: MenuProps['items'] = [
    { key: 'settings', label: '系统设置', icon: <SettingOutlined /> },
    { key: 'pipeline', label: '流水线配置', icon: <AppstoreOutlined /> },
    { key: 'permissions', label: '权限管理', icon: <SafetyOutlined /> },
    { key: 'help', label: '帮助与反馈', icon: <QuestionCircleOutlined /> },
    { type: 'divider' },
    { key: 'logout', label: '退出登录', danger: true, icon: <LogoutOutlined /> },
  ];

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    switch (e.key) {
      case 'logout':
        handleLogout();
        break;
      case 'settings':
        router.push('/settings');
        break;
      case 'pipeline':
        router.push('/settings/pipeline');
        break;
      case 'permissions':
        router.push('/settings/permissions');
        break;
      case 'help':
        router.push('/help');
        break;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={currentWidth}
        className="app-sider"
        style={{
          position: 'fixed',
          height: '100vh',
          left: 0,
          top: 0,
          zIndex: 100,
          transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1), background var(--transition-base)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Brand Header */}
          <div className="brand-glow" style={{
            padding: collapsed ? '12px 0' : '16px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            transition: 'padding var(--transition-base)',
            minHeight: collapsed ? 52 : undefined,
            flexShrink: 0,
          }}>
            {!collapsed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                <Image src="/logo.png" alt="logo" width={28} height={28} style={{ borderRadius: 6, flexShrink: 0 }} />
                <Title level={5} style={{ margin: 0, color: 'var(--color-foreground)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  知识智库
                </Title>
              </div>
            )}
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, color: 'var(--color-secondary)' }}
            />
          </div>

          {/* Gradient Divider */}
          <div className="sidebar-divider" />

          {/* Navigation */}
          <nav style={{ flex: 1, padding: collapsed ? '12px 0' : '12px 12px', overflow: 'auto' }}>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.key);
              const className = [
                'nav-item',
                active ? 'nav-item--active' : '',
                collapsed ? 'nav-item--collapsed' : '',
              ].filter(Boolean).join(' ');

              const link = (
                <Link key={item.key} href={item.path} style={{ display: 'block' }}>
                  <div className={className}>
                    <span className="nav-icon" style={{ fontSize: 16, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.key} title={item.label} placement="right">
                    {link}
                  </Tooltip>
                );
              }
              return link;
            })}
          </nav>

          {/* User Footer */}
          <div style={{
            padding: collapsed ? '8px 0' : '8px 12px',
            flexShrink: 0,
            background: 'var(--color-muted)',
            margin: 8,
            borderRadius: 'var(--radius-md)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              gap: 8,
            }}>
              {/* Avatar - separate dropdown */}
              <Dropdown menu={{ items: [{ key: 'logout', label: '退出登录', danger: true, icon: <LogoutOutlined /> }], onClick: handleMenuClick }} placement="topRight" trigger={['click']}>
                <Avatar
                  size={collapsed ? 28 : 32}
                  icon={<UserOutlined />}
                  style={{ background: 'var(--color-accent)', cursor: 'pointer', flexShrink: 0 }}
                />
              </Dropdown>

              {!collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', flex: 1 }}>
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <Text style={{ fontSize: 13, display: 'block', color: 'var(--color-foreground)', fontWeight: 500 }}>
                      {username}
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--color-success)',
                        boxShadow: '0 0 6px var(--color-success)',
                        display: 'inline-block',
                      }} />
                      <Text style={{ fontSize: 11, color: 'var(--color-secondary)' }}>
                        {roleLabel}
                      </Text>
                    </div>
                  </div>
                </div>
              )}

              {/* More button - dropdown menu */}
              <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="topRight" trigger={['click']}>
                <Button
                  type="text"
                  icon={<MoreOutlined />}
                  style={{ fontSize: 16, color: 'var(--color-secondary)', flexShrink: 0 }}
                />
              </Dropdown>
            </div>
          </div>
        </div>
      </Sider>

      <Content
        className="app-content"
        style={{
          marginLeft: currentWidth,
          padding: 'var(--space-8) var(--space-12)',
          maxWidth: 'var(--content-max-width)',
          transition: 'margin-left var(--transition-base)',
          ...contentStyle,
        }}
      >
        {children}
      </Content>
    </Layout>
  );
}

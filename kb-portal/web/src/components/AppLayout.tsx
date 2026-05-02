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
  BgColorsOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

const NAV_ITEMS = [
  { key: 'home', icon: <FileTextOutlined />, label: '知识库', path: '/' },
  { key: 'spaces', icon: <FolderOutlined />, label: '知识空间', path: '/spaces/list' },
  { key: 'chat', icon: <RobotOutlined />, label: '知识问答', path: '/rag' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置', path: '/settings' },
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
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();

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

  const themeMenuItems: MenuProps['items'] = [
    { key: 'theme-system', label: '随系统', icon: themeMode === 'system' ? <CheckOutlined /> : <span style={{ width: 14 }} /> },
    { key: 'theme-light', label: '浅色', icon: themeMode === 'light' ? <CheckOutlined /> : <span style={{ width: 14 }} /> },
    { key: 'theme-dark', label: '深色', icon: themeMode === 'dark' ? <CheckOutlined /> : <span style={{ width: 14 }} /> },
  ];

  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', label: '个人中心', icon: <UserOutlined /> },
    {
      key: 'theme',
      label: '主题',
      icon: <BgColorsOutlined />,
      children: themeMenuItems,
    },
    { type: 'divider' },
    { key: 'logout', label: '退出登录', danger: true, icon: <LogoutOutlined /> },
  ];

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    switch (e.key) {
      case 'logout':
        handleLogout();
        break;
      case 'theme-system':
        setThemeMode('system');
        break;
      case 'theme-light':
        setThemeMode('light');
        break;
      case 'theme-dark':
        setThemeMode('dark');
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
          transition: 'width var(--transition-base)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Brand Header */}
          <div style={{
            padding: collapsed ? '16px 0' : '20px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            transition: 'padding var(--transition-base)',
            minHeight: collapsed ? 56 : undefined,
            flexShrink: 0,
          }}>
            {!collapsed && (
              <div>
                <Title level={5} style={{ margin: 0, color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>
                  企业AI知识库
                </Title>
                <Text style={{ fontSize: 11, color: 'var(--color-secondary)' }}>KB Platform</Text>
              </div>
            )}
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, color: 'var(--color-secondary)' }}
            />
          </div>

          {/* Navigation */}
          <nav style={{ flex: 1, padding: collapsed ? '12px 0' : '8px', overflow: 'auto' }}>
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
                    <span style={{ fontSize: 16, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
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
            borderTop: '1px solid var(--color-border)',
            padding: collapsed ? '12px 0' : '12px',
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="topRight" trigger={['click']}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : 10,
                cursor: 'pointer',
                padding: collapsed ? 4 : '8px 12px',
                borderRadius: 'var(--radius-md)',
                transition: 'background var(--transition-fast)',
                width: collapsed ? undefined : '100%',
              }}>
                <Avatar
                  size={collapsed ? 32 : 36}
                  icon={<UserOutlined />}
                  style={{ background: 'var(--color-primary)', flexShrink: 0 }}
                />
                {!collapsed && (
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <Text style={{ fontSize: 13, display: 'block', color: 'var(--color-foreground)' }}>
                      {(typeof window !== 'undefined' && sessionStorage.getItem('username')) || 'admin'}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'var(--color-secondary)' }}>
                      {(typeof window !== 'undefined' && sessionStorage.getItem('roleLabel')) || '管理员'}
                    </Text>
                  </div>
                )}
              </div>
            </Dropdown>
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

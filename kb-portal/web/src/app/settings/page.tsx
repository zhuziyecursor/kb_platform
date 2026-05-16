'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Space,
  Descriptions,
  Tag,
  Select,
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
import ModelConfigPanel from './ModelConfigPanel';
import styles from './model-config.module.css';

const { Title, Text } = Typography;

export default function SettingsPage() {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();
  const [username, setUsername] = useState('admin');
  const [roleLabel, setRoleLabel] = useState('管理员');

  useEffect(() => {
    setUsername(sessionStorage.getItem('username') || 'admin');
    setRoleLabel(sessionStorage.getItem('roleLabel') || '管理员');
  }, []);

  return (
    <AppLayout>
      {/* ── Glass Header ── */}
      <div className={styles.glassHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SettingOutlined style={{ fontSize: 24, color: 'var(--color-accent)' }} />
          <h1 className={styles.glassTitle}>系统设置</h1>
        </div>
      </div>

      {/* ── Inset Group: 个人设置 ── */}
      <div className={styles.sectionLabel}>
        <UserOutlined style={{ marginRight: 6 }} />
        个人设置
      </div>
      <div className={styles.insetGroup} style={{ marginBottom: 28 }}>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>用户名</div>
          </div>
          <div className={styles.rowTrailing}>
            <Text strong style={{ color: 'var(--color-foreground)' }}>{username}</Text>
          </div>
        </div>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>角色</div>
          </div>
          <div className={styles.rowTrailing}>
            <Tag color="blue" style={{ borderRadius: 10, margin: 0 }}>{roleLabel}</Tag>
          </div>
        </div>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>登录方式</div>
          </div>
          <div className={styles.rowTrailing}>
            <Tag style={{ borderRadius: 10, margin: 0 }}>OAuth2 / OBO Token</Tag>
          </div>
        </div>
      </div>

      {/* ── Inset Group: 外观设置 ── */}
      <div className={styles.sectionLabel}>
        <BgColorsOutlined style={{ marginRight: 6 }} />
        外观设置
      </div>
      <div className={styles.insetGroup} style={{ marginBottom: 28 }}>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>主题模式</div>
            <div className={styles.rowSubtitle}>更改界面配色方案</div>
          </div>
          <div className={styles.rowTrailing}>
            <Select
              value={themeMode}
              onChange={(val) => setThemeMode(val)}
              style={{ width: 120 }}
              size="small"
              options={[
                { label: '随系统', value: 'system' },
                { label: '浅色', value: 'light' },
                { label: '深色', value: 'dark' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── Section: AI 模型配置 ── */}
      <div className={styles.sectionLabel}>
        <GlobalOutlined style={{ marginRight: 6 }} />
        AI 模型
      </div>
      <ModelConfigPanel />

      {/* ── Inset Group: 连接配置 ── */}
      <div className={styles.sectionLabel}>
        <ApiOutlined style={{ marginRight: 6 }} />
        连接配置
      </div>
      <div className={styles.insetGroup} style={{ marginBottom: 28 }}>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>网关地址</div>
          </div>
          <div className={styles.rowTrailing}>
            <Text code style={{ fontSize: 12 }}>
              {process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8081'}
            </Text>
          </div>
        </div>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>认证方式</div>
          </div>
          <div className={styles.rowTrailing}>
            <Tag style={{ borderRadius: 10, margin: 0 }}>Bearer JWT (OBO)</Tag>
          </div>
        </div>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>Token 有效期</div>
          </div>
          <div className={styles.rowTrailing}>
            <Text type="secondary">5 分钟</Text>
          </div>
        </div>
      </div>

      {/* ── Inset Group: 系统信息 ── */}
      <div className={styles.sectionLabel}>
        <InfoCircleOutlined style={{ marginRight: 6 }} />
        系统信息
      </div>
      <div className={styles.insetGroup} style={{ marginBottom: 40 }}>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>平台版本</div>
          </div>
          <div className={styles.rowTrailing}>
            <Tag style={{ borderRadius: 10, margin: 0 }}>MVP v1.0.0</Tag>
          </div>
        </div>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>前端框架</div>
          </div>
          <div className={styles.rowTrailing}>
            <Text type="secondary">Next.js + Ant Design</Text>
          </div>
        </div>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>后端框架</div>
          </div>
          <div className={styles.rowTrailing}>
            <Text type="secondary">Spring Boot 3.2 + Kafka</Text>
          </div>
        </div>
        <div className={styles.insetRow}>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>嵌入模型</div>
          </div>
          <div className={styles.rowTrailing}>
            <Text code style={{ fontSize: 12 }}>BGE-zh-v1.5</Text>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

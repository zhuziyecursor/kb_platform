'use client';

import React from 'react';
import { Breadcrumb, Typography, Space } from 'antd';
import Link from 'next/link';
import { HomeOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export interface PageHeaderProps {
  /** 面包屑导航，若不传则不显示 */
  breadcrumbs?: Array<{ title: React.ReactNode; href?: string }>;
  /** 页面主标题 */
  title: React.ReactNode;
  /** 页面副标题/描述 */
  description?: React.ReactNode;
  /** 右上角操作区 */
  actions?: React.ReactNode;
  /** 标题下方自定义内容（如 Tab、筛选栏等） */
  extra?: React.ReactNode;
}

export default function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  extra,
}: PageHeaderProps) {
  return (
    <div
      style={{
        marginBottom: 24,
      }}
    >
      {/* 面包屑 */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb
          items={[
            {
              title: (
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <HomeOutlined style={{ fontSize: 12 }} />
                  首页
                </Link>
              ),
            },
            ...breadcrumbs,
          ]}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* 标题栏：标题 + 描述 + 操作按钮 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Title
            level={3}
            style={{
              margin: 0,
              color: 'var(--color-foreground)',
              fontWeight: 600,
              fontSize: 20,
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </Title>
          {description && (
            <Text
              style={{
                display: 'block',
                marginTop: 4,
                color: 'var(--color-secondary)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {description}
            </Text>
          )}
        </div>

        {actions && (
          <div style={{ flexShrink: 0 }}>
            <Space>{actions}</Space>
          </div>
        )}
      </div>

      {/* 额外内容（如 Tab 切换、筛选栏） */}
      {extra && (
        <div style={{ marginTop: 16 }}>{extra}</div>
      )}
    </div>
  );
}

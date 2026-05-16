'use client';

import React from 'react';
import { Button, Typography } from 'antd';
import {
  ExclamationCircleOutlined,
  HomeOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import Link from 'next/link';

const { Text, Title } = Typography;

interface RouteStateProps {
  status?: 'loading' | 'error' | 'not-found';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  showHome?: boolean;
}

export default function RouteState({
  status = 'error',
  title,
  description,
  actionLabel,
  onAction,
  showHome = true,
}: RouteStateProps) {
  const isLoading = status === 'loading';

  return (
    <main className="route-state" aria-busy={isLoading}>
      <div className="route-state__panel">
        <div className={`route-state__icon route-state__icon--${status}`}>
          {isLoading ? <LoadingOutlined spin /> : <ExclamationCircleOutlined />}
        </div>

        <Title level={2} className="route-state__title">
          {title}
        </Title>
        <Text className="route-state__description">{description}</Text>

        <div className="route-state__actions">
          {onAction && (
            <Button type="primary" icon={<ReloadOutlined />} onClick={onAction}>
              {actionLabel || '重试'}
            </Button>
          )}
          {showHome && (
            <Link href="/">
              <Button icon={<HomeOutlined />}>返回首页</Button>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

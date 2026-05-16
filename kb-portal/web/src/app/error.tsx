'use client';

import React, { useEffect } from 'react';
import RouteState from '@/components/RouteState';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route rendering failed:', error);
  }, [error]);

  return (
    <RouteState
      status="error"
      title="页面暂时不可用"
      description="当前页面加载时遇到问题，重试后仍失败请检查服务状态或稍后再试。"
      actionLabel="重新加载"
      onAction={reset}
    />
  );
}

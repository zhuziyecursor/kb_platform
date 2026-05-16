import React from 'react';
import RouteState from '@/components/RouteState';

export default function NotFound() {
  return (
    <RouteState
      status="not-found"
      title="页面不存在"
      description="你访问的页面不存在或已被移动。"
    />
  );
}

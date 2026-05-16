import React from 'react';
import RouteState from '@/components/RouteState';

export default function Loading() {
  return (
    <RouteState
      status="loading"
      title="正在加载"
      description="正在准备页面数据，请稍候。"
      showHome={false}
    />
  );
}

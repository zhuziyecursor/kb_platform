'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import AppLayout from '@/components/AppLayout';

export default function ExtensionsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/skills');
  }, [router]);

  return (
    <AppLayout>
      <div style={{ height: '60vh', display: 'grid', placeItems: 'center' }}>
        <Spin tip="正在进入技能中心..." />
      </div>
    </AppLayout>
  );
}

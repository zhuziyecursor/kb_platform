'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SpacesIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/spaces/list');
  }, []);

  return null;
}

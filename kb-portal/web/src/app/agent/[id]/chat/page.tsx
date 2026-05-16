'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App, Result, Spin } from 'antd';
import AppLayout from '@/components/AppLayout';
import { useAgents } from '@/hooks/useAgents';

const ACTIVE_AGENT_KEY = 'kb_active_expert_agent_id';

export default function AgentChatEntryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const { agents, loaded } = useAgents();
  const agentId = params.id;

  useEffect(() => {
    if (!loaded) return;
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      message.error('专家不存在或已被删除');
      return;
    }
    window.sessionStorage.setItem(ACTIVE_AGENT_KEY, agent.id);
    router.replace('/rag');
  }, [agentId, agents, loaded, message, router]);

  if (loaded && !agents.some((item) => item.id === agentId)) {
    return (
      <AppLayout>
        <Result status="404" title="专家不存在" subTitle="请返回专家广场选择可用专家。" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ height: '60vh', display: 'grid', placeItems: 'center' }}>
        <Spin tip="正在进入专家对话..." />
      </div>
    </AppLayout>
  );
}

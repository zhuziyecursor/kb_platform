'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import defaultAgents from '@/data/default-agents.json';

export type AgentStatus = 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'LISTED';

export type ExpertType = 'rag' | 'assistant';

export interface ExpertAgent {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  systemPrompt: string;
  spaceIds: string[];
  skillIds: string[];
  expertType: ExpertType;
  status: AgentStatus;
  publishNote?: string;
  rejectReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpertAgentInput {
  name: string;
  description: string;
  icon: string;
  category: string;
  systemPrompt: string;
  spaceIds?: string[];
  skillIds?: string[];
  expertType?: ExpertType;
  publishNote?: string;
}

const STORAGE_KEY = 'kb_expert_agents';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeAgent(agent: Partial<ExpertAgent> & { id: string; name: string }): ExpertAgent {
  const timestamp = nowIso();
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description || '',
    icon: agent.icon || '🤖',
    category: agent.category || '其他',
    systemPrompt: agent.systemPrompt || '',
    spaceIds: Array.isArray(agent.spaceIds) ? agent.spaceIds : [],
    skillIds: Array.isArray(agent.skillIds) ? agent.skillIds : [],
    expertType: agent.expertType || 'rag',
    status: agent.status || 'DRAFT',
    publishNote: agent.publishNote,
    rejectReason: agent.rejectReason,
    createdAt: agent.createdAt || timestamp,
    updatedAt: agent.updatedAt || timestamp,
  };
}

function readAgents(): ExpertAgent[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((agent): agent is Partial<ExpertAgent> & { id: string; name: string } =>
        !!agent && typeof agent.id === 'string' && typeof agent.name === 'string'
      )
      .map(normalizeAgent);
  } catch {
    console.error(`Failed to load ${STORAGE_KEY} from localStorage`);
    return [];
  }
}

function writeAgents(agents: ExpertAgent[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch (error) {
    console.error(`Failed to save ${STORAGE_KEY}:`, error);
  }
}

function mergeDefaultAgents(stored: ExpertAgent[]): ExpertAgent[] {
  const storedIds = new Set(stored.map((agent) => agent.id));
  const defaults = (defaultAgents as Array<Partial<ExpertAgent> & { id: string; name: string }>).map(normalizeAgent);
  const defaultIds = new Set(defaults.map((a) => a.id));
  // Keep only user-created agents (non-default ids), merge with fresh defaults
  const userAgents = stored.filter((agent) => !defaultIds.has(agent.id));
  return [...defaults, ...userAgents];
}

export function useAgents() {
  const [agents, setAgents] = useState<ExpertAgent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const merged = mergeDefaultAgents(readAgents());
    setAgents(merged);
    writeAgents(merged);
    setLoaded(true);
  }, []);

  const persist = useCallback((nextAgents: ExpertAgent[]) => {
    setAgents(nextAgents);
    writeAgents(nextAgents);
  }, []);

  const addAgent = useCallback((input: ExpertAgentInput, status: AgentStatus = 'DRAFT') => {
    const timestamp = nowIso();
    const nextAgent: ExpertAgent = {
      id: generateId(),
      name: input.name,
      description: input.description,
      icon: input.icon || '🤖',
      category: input.category || '其他',
      systemPrompt: input.systemPrompt,
      spaceIds: input.spaceIds || [],
      skillIds: input.skillIds || [],
      expertType: input.expertType || 'rag',
      status,
      publishNote: input.publishNote,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    persist([...agents, nextAgent]);
    return nextAgent;
  }, [agents, persist]);

  const updateAgent = useCallback((id: string, updates: Partial<ExpertAgent>) => {
    persist(agents.map((agent) =>
      agent.id === id
        ? { ...agent, ...updates, updatedAt: nowIso() }
        : agent
    ));
  }, [agents, persist]);

  const removeAgent = useCallback((id: string) => {
    persist(agents.filter((agent) => agent.id !== id));
  }, [agents, persist]);

  const submitForReview = useCallback((id: string, publishNote?: string) => {
    updateAgent(id, { status: 'PENDING', publishNote, rejectReason: undefined });
  }, [updateAgent]);

  const approveAgent = useCallback((id: string) => {
    updateAgent(id, { status: 'PUBLISHED', rejectReason: undefined });
  }, [updateAgent]);

  const rejectAgent = useCallback((id: string, rejectReason: string) => {
    updateAgent(id, { status: 'DRAFT', rejectReason });
  }, [updateAgent]);

  const listAgent = useCallback((id: string) => {
    updateAgent(id, { status: 'LISTED' });
  }, [updateAgent]);

  const unlistAgent = useCallback((id: string) => {
    updateAgent(id, { status: 'PUBLISHED' });
  }, [updateAgent]);

  const listedAgents = useMemo(() => agents.filter((agent) => agent.status === 'LISTED'), [agents]);

  return {
    agents,
    listedAgents,
    loaded,
    addAgent,
    updateAgent,
    removeAgent,
    submitForReview,
    approveAgent,
    rejectAgent,
    listAgent,
    unlistAgent,
  };
}

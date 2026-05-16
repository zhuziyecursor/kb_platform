'use client';

import { useState, useEffect, useCallback } from 'react';
import defaultExternalSkills from '@/data/external-skills.json';
import defaultPrompts from '@/data/prompts.json';
import defaultToolbox from '@/data/toolbox.json';

// ==================== Types ====================

export type SkillStatus = 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'ENABLED';

export interface PromptConfig {
  id: string;
  name: string;
  description: string;
  content?: string;
  variables?: string[];
  type: 'rag' | 'general';
  isDefault?: boolean;
  enabled: boolean;  // 是否启用
  createdAt?: string;
  updatedAt?: string;
  icon?: string;
  category?: string;
  author?: string;
  tags?: string[];
  installCommand?: string;
  status?: SkillStatus;
  rejectReason?: string;
}

export interface ExternalSkill {
  id: string;
  name: string;
  description: string;
  repoUrl: string;
  installCommand: string;
  type: 'cli';
  icon?: string;       // emoji icon
  category?: string;   // 分类标签
  author?: string;     // 作者
  enabled: boolean;   // 是否启用，可在知识问答中使用
  status?: SkillStatus;
  rejectReason?: string;
}

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  defaultValue?: string;
}

export interface CustomSkill {
  id: string;
  name: string;
  description: string;
  type: 'http' | 'script' | 'function';
  filePath: string;
  parameters: SkillParameter[];
  enabled: boolean;
  status?: SkillStatus;
  rejectReason?: string;
}

export interface MCPServer {
  id: string;
  name: string;
  type: 'stdio' | 'http';
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  lastTestAt?: string;
  lastTestResult?: 'success' | 'failed';
  status?: SkillStatus;
  rejectReason?: string;
}

export interface ToolboxTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  toolType: 'file-compare' | 'text-diff' | 'json-formatter' | 'code-formatter' | 'regex-tester' | 'dify-agent' | 'other';
  endpoint?: string;
  command?: string;
  redirectUrl?: string;
  enabled: boolean;
  status?: SkillStatus;
  rejectReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ==================== Storage Keys ====================

const STORAGE_KEYS = {
  prompts: 'kb_extension_prompts',
  externalSkills: 'kb_extension_external_skills',
  customSkills: 'kb_extension_custom_skills',
  mcpServers: 'kb_extension_mcp_servers',
  toolbox: 'kb_extension_toolbox',
};

// ==================== Utility ====================

function generateId(): string {
  return `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as T;
    }
  } catch {
    console.error(`Failed to load ${key} from localStorage`);
  }
  return defaultValue;
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Failed to save ${key}:`, error);
  }
}

function mergeDefaultsById<T extends { id: string }>(stored: T[], defaults: T[]): T[] {
  const storedIds = new Set(stored.map((item) => item.id));
  return [...defaults.filter((item) => !storedIds.has(item.id)), ...stored];
}

function normalizeSkillStatus<T extends { enabled?: boolean; status?: SkillStatus }>(item: T): T {
  return {
    ...item,
    status: item.status || (item.enabled ? 'ENABLED' : 'PUBLISHED'),
  };
}

function normalizeSkillCollection<T extends { enabled?: boolean; status?: SkillStatus }>(items: T[]): T[] {
  return items.map(normalizeSkillStatus);
}

// ==================== Hook ====================

export function useExtensions() {
  // Prompts
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [promptsLoaded, setPromptsLoaded] = useState(false);

  // External Skills
  const [externalSkills, setExternalSkills] = useState<ExternalSkill[]>([]);
  const [externalSkillsLoaded, setExternalSkillsLoaded] = useState(false);

  // Custom Skills
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [customSkillsLoaded, setCustomSkillsLoaded] = useState(false);

  // MCP Servers
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [mcpServersLoaded, setMcpServersLoaded] = useState(false);

  // Toolbox
  const [toolbox, setToolbox] = useState<ToolboxTool[]>([]);
  const [toolboxLoaded, setToolboxLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const loadedPrompts = normalizeSkillCollection(loadFromStorage(STORAGE_KEYS.prompts, defaultPrompts as PromptConfig[]));
    setPrompts(loadedPrompts);
    saveToStorage(STORAGE_KEYS.prompts, loadedPrompts);
    setPromptsLoaded(true);

    const loadedExternalSkills = normalizeSkillCollection(loadFromStorage(STORAGE_KEYS.externalSkills, defaultExternalSkills as ExternalSkill[]));
    const mergedExternalSkills = normalizeSkillCollection(mergeDefaultsById(loadedExternalSkills, defaultExternalSkills as ExternalSkill[]));
    setExternalSkills(mergedExternalSkills);
    saveToStorage(STORAGE_KEYS.externalSkills, mergedExternalSkills);
    setExternalSkillsLoaded(true);

    const loadedCustomSkills = normalizeSkillCollection(loadFromStorage(STORAGE_KEYS.customSkills, [] as CustomSkill[]));
    setCustomSkills(loadedCustomSkills);
    saveToStorage(STORAGE_KEYS.customSkills, loadedCustomSkills);
    setCustomSkillsLoaded(true);

    const loadedMcpServers = normalizeSkillCollection(loadFromStorage(STORAGE_KEYS.mcpServers, [] as MCPServer[]));
    setMcpServers(loadedMcpServers);
    saveToStorage(STORAGE_KEYS.mcpServers, loadedMcpServers);
    setMcpServersLoaded(true);

    const loadedToolbox = normalizeSkillCollection(loadFromStorage(STORAGE_KEYS.toolbox, defaultToolbox as ToolboxTool[]));
    const mergedToolbox = normalizeSkillCollection(mergeDefaultsById(loadedToolbox, defaultToolbox as ToolboxTool[]));
    setToolbox(mergedToolbox);
    saveToStorage(STORAGE_KEYS.toolbox, mergedToolbox);
    setToolboxLoaded(true);
  }, []);

  // ==================== Prompts CRUD ====================

  const addPrompt = useCallback((prompt: Omit<PromptConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newPrompt: PromptConfig = {
      ...prompt,
      id: generateId(),
      status: prompt.status || (prompt.enabled ? 'ENABLED' : 'PUBLISHED'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const newPrompts = [...prompts, newPrompt];
    saveToStorage(STORAGE_KEYS.prompts, newPrompts);
    setPrompts(newPrompts);
    return newPrompt;
  }, [prompts]);

  const updatePrompt = useCallback((id: string, updates: Partial<PromptConfig>) => {
    const newPrompts = prompts.map(p =>
      p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    );
    saveToStorage(STORAGE_KEYS.prompts, newPrompts);
    setPrompts(newPrompts);
  }, [prompts]);

  const removePrompt = useCallback((id: string) => {
    const newPrompts = prompts.filter(p => p.id !== id);
    saveToStorage(STORAGE_KEYS.prompts, newPrompts);
    setPrompts(newPrompts);
  }, [prompts]);

  const setDefaultPrompt = useCallback((id: string) => {
    const newPrompts = prompts.map(p => ({
      ...p,
      isDefault: p.id === id,
    }));
    saveToStorage(STORAGE_KEYS.prompts, newPrompts);
    setPrompts(newPrompts);
  }, [prompts]);

  const exportPrompts = useCallback(() => {
    const blob = new Blob([JSON.stringify(prompts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kb-prompts-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [prompts]);

  const importPrompts = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string) as PromptConfig[];
          if (Array.isArray(imported)) {
            const merged = imported.map(p => ({ ...p, id: generateId() }));
            const newPrompts = [...prompts, ...merged];
            saveToStorage(STORAGE_KEYS.prompts, newPrompts);
            setPrompts(newPrompts);
            resolve(true);
          } else {
            resolve(false);
          }
        } catch {
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  }, [prompts]);

  const submitPromptForReview = useCallback((id: string) => {
    updatePrompt(id, { status: 'PENDING', enabled: false, rejectReason: undefined });
  }, [updatePrompt]);

  const approvePrompt = useCallback((id: string) => {
    updatePrompt(id, { status: 'PUBLISHED', enabled: false, rejectReason: undefined });
  }, [updatePrompt]);

  const rejectPrompt = useCallback((id: string, rejectReason: string) => {
    updatePrompt(id, { status: 'DRAFT', enabled: false, rejectReason });
  }, [updatePrompt]);

  const enablePrompt = useCallback((id: string) => {
    updatePrompt(id, { status: 'ENABLED', enabled: true });
  }, [updatePrompt]);

  const disablePrompt = useCallback((id: string) => {
    updatePrompt(id, { status: 'PUBLISHED', enabled: false });
  }, [updatePrompt]);

  // ==================== External Skills CRUD ====================

  const addExternalSkill = useCallback((skill: Omit<ExternalSkill, 'id'>) => {
    const newSkill: ExternalSkill = { ...skill, id: generateId(), status: skill.status || (skill.enabled ? 'ENABLED' : 'PUBLISHED') };
    const newSkills = [...externalSkills, newSkill];
    saveToStorage(STORAGE_KEYS.externalSkills, newSkills);
    setExternalSkills(newSkills);
    return newSkill;
  }, [externalSkills]);

  const updateExternalSkill = useCallback((id: string, updates: Partial<ExternalSkill>) => {
    const newSkills = externalSkills.map(s => s.id === id ? { ...s, ...updates } : s);
    saveToStorage(STORAGE_KEYS.externalSkills, newSkills);
    setExternalSkills(newSkills);
  }, [externalSkills]);

  const removeExternalSkill = useCallback((id: string) => {
    const newSkills = externalSkills.filter(s => s.id !== id);
    saveToStorage(STORAGE_KEYS.externalSkills, newSkills);
    setExternalSkills(newSkills);
  }, [externalSkills]);

  const exportExternalSkills = useCallback(() => {
    const blob = new Blob([JSON.stringify(externalSkills, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kb-external-skills-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [externalSkills]);

  const importExternalSkills = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string) as ExternalSkill[];
          if (Array.isArray(imported)) {
            const merged = imported.map(s => ({ ...s, id: generateId() }));
            const newSkills = [...externalSkills, ...merged];
            saveToStorage(STORAGE_KEYS.externalSkills, newSkills);
            setExternalSkills(newSkills);
            resolve(true);
          } else {
            resolve(false);
          }
        } catch {
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  }, [externalSkills]);

  const submitExternalSkillForReview = useCallback((id: string) => {
    updateExternalSkill(id, { status: 'PENDING', enabled: false, rejectReason: undefined });
  }, [updateExternalSkill]);

  const approveExternalSkill = useCallback((id: string) => {
    updateExternalSkill(id, { status: 'PUBLISHED', enabled: false, rejectReason: undefined });
  }, [updateExternalSkill]);

  const rejectExternalSkill = useCallback((id: string, rejectReason: string) => {
    updateExternalSkill(id, { status: 'DRAFT', enabled: false, rejectReason });
  }, [updateExternalSkill]);

  const enableExternalSkill = useCallback((id: string) => {
    updateExternalSkill(id, { status: 'ENABLED', enabled: true });
  }, [updateExternalSkill]);

  const disableExternalSkill = useCallback((id: string) => {
    updateExternalSkill(id, { status: 'PUBLISHED', enabled: false });
  }, [updateExternalSkill]);

  // ==================== Custom Skills CRUD ====================

  const addCustomSkill = useCallback((skill: Omit<CustomSkill, 'id'>) => {
    const newSkill: CustomSkill = { ...skill, id: generateId(), status: skill.status || (skill.enabled ? 'ENABLED' : 'PUBLISHED') };
    const newSkills = [...customSkills, newSkill];
    saveToStorage(STORAGE_KEYS.customSkills, newSkills);
    setCustomSkills(newSkills);
    return newSkill;
  }, [customSkills]);

  const updateCustomSkill = useCallback((id: string, updates: Partial<CustomSkill>) => {
    const newSkills = customSkills.map(s => s.id === id ? { ...s, ...updates } : s);
    saveToStorage(STORAGE_KEYS.customSkills, newSkills);
    setCustomSkills(newSkills);
  }, [customSkills]);

  const removeCustomSkill = useCallback((id: string) => {
    const newSkills = customSkills.filter(s => s.id !== id);
    saveToStorage(STORAGE_KEYS.customSkills, newSkills);
    setCustomSkills(newSkills);
  }, [customSkills]);

  const exportCustomSkills = useCallback(() => {
    const blob = new Blob([JSON.stringify(customSkills, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kb-custom-skills-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [customSkills]);

  const importCustomSkills = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string) as CustomSkill[];
          if (Array.isArray(imported)) {
            const merged = imported.map(s => ({ ...s, id: generateId() }));
            const newSkills = [...customSkills, ...merged];
            saveToStorage(STORAGE_KEYS.customSkills, newSkills);
            setCustomSkills(newSkills);
            resolve(true);
          } else {
            resolve(false);
          }
        } catch {
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  }, [customSkills]);

  const submitCustomSkillForReview = useCallback((id: string) => {
    updateCustomSkill(id, { status: 'PENDING', enabled: false, rejectReason: undefined });
  }, [updateCustomSkill]);

  const approveCustomSkill = useCallback((id: string) => {
    updateCustomSkill(id, { status: 'PUBLISHED', enabled: false, rejectReason: undefined });
  }, [updateCustomSkill]);

  const rejectCustomSkill = useCallback((id: string, rejectReason: string) => {
    updateCustomSkill(id, { status: 'DRAFT', enabled: false, rejectReason });
  }, [updateCustomSkill]);

  const enableCustomSkill = useCallback((id: string) => {
    updateCustomSkill(id, { status: 'ENABLED', enabled: true });
  }, [updateCustomSkill]);

  const disableCustomSkill = useCallback((id: string) => {
    updateCustomSkill(id, { status: 'PUBLISHED', enabled: false });
  }, [updateCustomSkill]);

  // ==================== MCP Servers CRUD ====================

  const addMCPServer = useCallback((server: Omit<MCPServer, 'id'>) => {
    const newServer: MCPServer = { ...server, id: generateId(), status: server.status || (server.enabled ? 'ENABLED' : 'PUBLISHED') };
    const newServers = [...mcpServers, newServer];
    saveToStorage(STORAGE_KEYS.mcpServers, newServers);
    setMcpServers(newServers);
    return newServer;
  }, [mcpServers]);

  const updateMCPServer = useCallback((id: string, updates: Partial<MCPServer>) => {
    const newServers = mcpServers.map(s => s.id === id ? { ...s, ...updates } : s);
    saveToStorage(STORAGE_KEYS.mcpServers, newServers);
    setMcpServers(newServers);
  }, [mcpServers]);

  const removeMCPServer = useCallback((id: string) => {
    const newServers = mcpServers.filter(s => s.id !== id);
    saveToStorage(STORAGE_KEYS.mcpServers, newServers);
    setMcpServers(newServers);
  }, [mcpServers]);

  const testMCPServer = useCallback((id: string) => {
    const newServers = mcpServers.map(s =>
      s.id === id
        ? { ...s, lastTestAt: new Date().toISOString(), lastTestResult: 'success' as const }
        : s
    );
    saveToStorage(STORAGE_KEYS.mcpServers, newServers);
    setMcpServers(newServers);
  }, [mcpServers]);

  const exportMCPServers = useCallback(() => {
    const blob = new Blob([JSON.stringify(mcpServers, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kb-mcp-servers-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [mcpServers]);

  const importMCPServers = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string) as MCPServer[];
          if (Array.isArray(imported)) {
            const merged = imported.map(s => ({ ...s, id: generateId() }));
            const newServers = [...mcpServers, ...merged];
            saveToStorage(STORAGE_KEYS.mcpServers, newServers);
            setMcpServers(newServers);
            resolve(true);
          } else {
            resolve(false);
          }
        } catch {
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  }, [mcpServers]);

  const submitMCPServerForReview = useCallback((id: string) => {
    updateMCPServer(id, { status: 'PENDING', enabled: false, rejectReason: undefined });
  }, [updateMCPServer]);

  const approveMCPServer = useCallback((id: string) => {
    updateMCPServer(id, { status: 'PUBLISHED', enabled: false, rejectReason: undefined });
  }, [updateMCPServer]);

  const rejectMCPServer = useCallback((id: string, rejectReason: string) => {
    updateMCPServer(id, { status: 'DRAFT', enabled: false, rejectReason });
  }, [updateMCPServer]);

  const enableMCPServer = useCallback((id: string) => {
    updateMCPServer(id, { status: 'ENABLED', enabled: true });
  }, [updateMCPServer]);

  const disableMCPServer = useCallback((id: string) => {
    updateMCPServer(id, { status: 'PUBLISHED', enabled: false });
  }, [updateMCPServer]);

  // ==================== Toolbox CRUD ====================

  const addToolboxTool = useCallback((tool: Omit<ToolboxTool, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTool: ToolboxTool = {
      ...tool,
      id: generateId(),
      status: tool.status || (tool.enabled ? 'ENABLED' : 'PUBLISHED'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const newTools = [...toolbox, newTool];
    saveToStorage(STORAGE_KEYS.toolbox, newTools);
    setToolbox(newTools);
    return newTool;
  }, [toolbox]);

  const updateToolboxTool = useCallback((id: string, updates: Partial<ToolboxTool>) => {
    const newTools = toolbox.map(t =>
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    );
    saveToStorage(STORAGE_KEYS.toolbox, newTools);
    setToolbox(newTools);
  }, [toolbox]);

  const removeToolboxTool = useCallback((id: string) => {
    const newTools = toolbox.filter(t => t.id !== id);
    saveToStorage(STORAGE_KEYS.toolbox, newTools);
    setToolbox(newTools);
  }, [toolbox]);

  const submitToolboxToolForReview = useCallback((id: string) => {
    updateToolboxTool(id, { status: 'PENDING', enabled: false, rejectReason: undefined });
  }, [updateToolboxTool]);

  const approveToolboxTool = useCallback((id: string) => {
    updateToolboxTool(id, { status: 'PUBLISHED', enabled: false, rejectReason: undefined });
  }, [updateToolboxTool]);

  const rejectToolboxTool = useCallback((id: string, rejectReason: string) => {
    updateToolboxTool(id, { status: 'DRAFT', enabled: false, rejectReason });
  }, [updateToolboxTool]);

  const enableToolboxTool = useCallback((id: string) => {
    updateToolboxTool(id, { status: 'ENABLED', enabled: true });
  }, [updateToolboxTool]);

  const disableToolboxTool = useCallback((id: string) => {
    updateToolboxTool(id, { status: 'PUBLISHED', enabled: false });
  }, [updateToolboxTool]);

  return {
    // Prompts
    prompts,
    promptsLoaded,
    addPrompt,
    updatePrompt,
    removePrompt,
    setDefaultPrompt,
    exportPrompts,
    importPrompts,
    submitPromptForReview,
    approvePrompt,
    rejectPrompt,
    enablePrompt,
    disablePrompt,
    // External Skills
    externalSkills,
    externalSkillsLoaded,
    addExternalSkill,
    updateExternalSkill,
    removeExternalSkill,
    exportExternalSkills,
    importExternalSkills,
    submitExternalSkillForReview,
    approveExternalSkill,
    rejectExternalSkill,
    enableExternalSkill,
    disableExternalSkill,
    // Custom Skills
    customSkills,
    customSkillsLoaded,
    addCustomSkill,
    updateCustomSkill,
    removeCustomSkill,
    exportCustomSkills,
    importCustomSkills,
    submitCustomSkillForReview,
    approveCustomSkill,
    rejectCustomSkill,
    enableCustomSkill,
    disableCustomSkill,
    // MCP Servers
    mcpServers,
    mcpServersLoaded,
    addMCPServer,
    updateMCPServer,
    removeMCPServer,
    testMCPServer,
    exportMCPServers,
    importMCPServers,
    submitMCPServerForReview,
    approveMCPServer,
    rejectMCPServer,
    enableMCPServer,
    disableMCPServer,
    // Toolbox
    toolbox,
    toolboxLoaded,
    addToolboxTool,
    updateToolboxTool,
    removeToolboxTool,
    submitToolboxToolForReview,
    approveToolboxTool,
    rejectToolboxTool,
    enableToolboxTool,
    disableToolboxTool,
  };
}

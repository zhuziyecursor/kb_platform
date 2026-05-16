'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LLMModelConfig, LLMProvider, LLMProviderInfo } from '@/types';

const STORAGE_KEY = 'kb_llm_models';

// LLM 提供商元信息
export const LLM_PROVIDERS: LLMProviderInfo[] = [
  // 国内模型
  { value: 'minimax',  label: 'MiniMax',   icon: '📱', defaultModel: 'MiniMax-M2.7' },
  { value: 'glm',      label: '智谱 GLM',   icon: '🔮', defaultModel: 'glm-4.7' },
  { value: 'deepseek', label: 'DeepSeek',  icon: '🐋', defaultModel: 'deepseek-chat' },
  { value: 'moonshot', label: 'Kimi月亮',   icon: '🌙', defaultModel: 'moonshot-v1-128k' },
  { value: 'qwen',     label: '通义千问',   icon: '🦅', defaultModel: 'qwen3.5-plus' },
  { value: 'doubao',   label: '豆包',       icon: '🌋', defaultModel: 'Doubao-Seed-2.0-pro' },
  { value: 'xunfei',   label: '讯飞星火',   icon: '🎤', defaultModel: 'spark-4.0' },
  // 国外模型
  { value: 'openai',    label: 'OpenAI',     icon: '🤖', defaultModel: 'gpt-5.4' },
  { value: 'anthropic', label: 'Anthropic',  icon: '🧠', defaultModel: 'claude-opus-4-7' },
  { value: 'gemini',    label: 'Gemini',     icon: '🔵', defaultModel: 'gemini-2.5-pro' },
  { value: 'grok',      label: 'Grok',       icon: '🚀', defaultModel: 'grok-4' },
  // 本地模型
  { value: 'ollama', label: 'Ollama', icon: '🦙', defaultModel: 'llama3.2' },
  { value: 'vllm',   label: 'vLLM',   icon: '⚡', defaultModel: 'default' },
  { value: 'custom', label: '自定义',  icon: '🔧', defaultModel: '' },
  // 旧兼容
  { value: 'google',     label: 'Google',    icon: '🔵', defaultModel: 'gemini-2.5-pro' },
  { value: 'volcengine', label: '火山引擎',   icon: '🌋', defaultModel: 'Doubao-Seed-2.0-pro' },
  { value: 'ali',        label: '阿里云',     icon: '🦅', defaultModel: 'qwen3.5-plus' },
];

// 默认模型列表（按提供商）
export const DEFAULT_MODELS: Record<string, string[]> = {
  // 国内模型
  minimax: [
    'MiniMax-M2.7',
    'MiniMax-M2.5',
    'MiniMax-Text-01',
    'abab6.5s-chat',
  ],
  glm: [
    'glm-4.7',
    'glm-4.5',
    'glm-4-plus',
    'glm-4-flash',
    'glm-4-long',
    'glm-4-air',
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-coder',
    'deepseek-reasoner',
  ],
  moonshot: [
    'moonshot-v1-128k',
    'moonshot-v1-32k',
    'moonshot-v1-8k',
  ],
  qwen: [
    'qwen3.5-plus',
    'qwen3.5-flash',
    'qwen3-max',
    'qwen3-coder-plus',
    'qwen3-coder-flash',
    'qwen-plus',
    'qwen-turbo',
    'qwen-long',
  ],
  doubao: [
    'Doubao-Seed-2.0-pro',
    'Doubao-Seed-2.0-lite',
    'Doubao-Seed-2.0-Code',
    'Doubao-Seed-1.8',
    'Doubao-pro-256k',
  ],
  xunfei: [
    'spark-4.0',
    'spark-4.0-ultra',
    'spark-lite',
    'spark-pro',
  ],
  // 国外模型
  openai: [
    'gpt-5.4',
    'gpt-5.3-chat-latest',
    'gpt-5.2',
    'gpt-5.2-pro',
    'gpt-5.1',
    'gpt-5.1-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
  ],
  anthropic: [
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-opus-4-0',
    'claude-sonnet-4-0',
    'claude-3-haiku-20240307',
  ],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-001',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  grok: [
    'grok-4',
    'grok-3',
    'grok-3-mini',
  ],
  // 本地模型
  ollama: [
    'llama3.2',
    'llama3.2-70b',
    'qwen2.5:7b',
    'qwen2.5:14b',
    'qwen2.5:32b',
    'deepseek-r1:8b',
    'deepseek-r1:14b',
    'mistral:7b',
    'codellama:7b',
  ],
  vllm: ['default'],
  custom: [],
  // 旧兼容
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  volcengine: ['Doubao-Seed-2.0-pro', 'Doubao-Seed-2.0-lite'],
  ali: ['qwen3.5-plus', 'qwen3.5-flash', 'qwen-plus', 'qwen-turbo'],
};

function generateId(): string {
  return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function useLLMModels() {
  const [models, setModels] = useState<LLMModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  // 从 localStorage 加载
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LLMModelConfig[];
        setModels(parsed);
        // 设置默认选中
        const defaultModel = parsed.find(m => m.isDefault) || parsed[0];
        if (defaultModel) {
          setSelectedModelId(defaultModel.id);
        }
      } else {
        // 添加默认的 MiniMax 模型
        const defaultModels: LLMModelConfig[] = [
          {
            id: generateId(),
            name: 'MiniMax (默认)',
            provider: 'minimax',
            apiKey: '',
            modelName: 'MiniMax-M2.7',
            isDefault: true,
          },
        ];
        setModels(defaultModels);
        setSelectedModelId(defaultModels[0].id);
      }
    } catch {
      console.error('Failed to load LLM models from localStorage');
    }
    setIsLoaded(true);
  }, []);

  // 保存到 localStorage
  const saveModels = useCallback((newModels: LLMModelConfig[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newModels));
      setModels(newModels);
    } catch (error) {
      console.error('Failed to save LLM models:', error);
    }
  }, []);

  // 添加模型
  const addModel = useCallback((model: Omit<LLMModelConfig, 'id'>) => {
    const newModel: LLMModelConfig = {
      ...model,
      id: generateId(),
    };
    const newModels = [...models, newModel];
    saveModels(newModels);
    return newModel;
  }, [models, saveModels]);

  // 删除模型
  const removeModel = useCallback((id: string) => {
    const newModels = models.filter(m => m.id !== id);
    saveModels(newModels);
    // 如果删除的是选中的模型，切换到第一个
    if (selectedModelId === id && newModels.length > 0) {
      setSelectedModelId(newModels[0].id);
    }
  }, [models, saveModels, selectedModelId]);

  // 更新模型
  const updateModel = useCallback((id: string, updates: Partial<LLMModelConfig>) => {
    const newModels = models.map(m => m.id === id ? { ...m, ...updates } : m);
    saveModels(newModels);
  }, [models, saveModels]);

  // 设置默认模型
  const setDefaultModel = useCallback((id: string) => {
    const newModels = models.map(m => ({
      ...m,
      isDefault: m.id === id,
    }));
    saveModels(newModels);
  }, [models, saveModels]);

  // 导出配置到 JSON 文件
  const exportModels = useCallback(() => {
    const dataStr = JSON.stringify(models, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `llm-models-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [models]);

  // 从 JSON 文件导入
  const importModels = useCallback((file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string) as LLMModelConfig[];
          if (Array.isArray(imported)) {
            // 合并：导入的模型 ID 重新生成避免冲突
            const mergedModels = imported.map(m => ({
              ...m,
              id: generateId(),
            }));
            saveModels([...models, ...mergedModels]);
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
  }, [models, saveModels]);

  // 获取当前选中的模型
  const selectedModel = models.find(m => m.id === selectedModelId);

  return {
    models,
    selectedModelId,
    selectedModel,
    setSelectedModelId,
    addModel,
    removeModel,
    updateModel,
    setDefaultModel,
    exportModels,
    importModels,
    isLoaded,
  };
}

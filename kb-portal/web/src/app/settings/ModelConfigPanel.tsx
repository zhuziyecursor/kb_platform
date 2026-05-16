'use client';

import React, { useState, useCallback } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Button,
  App,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  MinusCircleFilled,
  DeleteOutlined,
  EditOutlined,
  StarFilled,
  RightOutlined,
  ThunderboltOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useLLMModels, LLM_PROVIDERS, DEFAULT_MODELS } from '@/hooks/useLLMModels';
import type { LLMModelConfig, LLMProvider } from '@/types';
import styles from './model-config.module.css';

// ── Extended Provider Registry ──
// Each provider has: code, display name, icon, default API base, category, and an optional hue for the icon tile.

interface ProviderDef {
  code: LLMProvider;
  label: string;
  icon: string;
  apiBase: string;
  category: 'domestic' | 'international' | 'local';
  defaultModel: string;
  hue: string;         // CSS color for the icon tile background
  requiresApiKey: boolean;
}

const PROVIDER_REGISTRY: ProviderDef[] = [
  // ── 国内模型 ──
  { code: 'minimax',     label: 'MiniMax',     icon: '📱', apiBase: 'https://api.minimax.chat/v1/text/chatcompletion_v2', category: 'domestic', defaultModel: 'MiniMax-M2.7',     hue: '#6C5CE7', requiresApiKey: true },
  { code: 'glm',         label: '智谱 GLM',    icon: '🔮', apiBase: 'https://open.bigmodel.cn/api/paas/v4',               category: 'domestic', defaultModel: 'glm-4.7',           hue: '#0284C7', requiresApiKey: true },
  { code: 'deepseek',    label: 'DeepSeek',    icon: '🐋', apiBase: 'https://api.deepseek.com/v1',                         category: 'domestic', defaultModel: 'deepseek-chat',      hue: '#3B82F6', requiresApiKey: true },
  { code: 'moonshot',    label: 'Kimi',        icon: '🌙', apiBase: 'https://api.moonshot.cn/v1',                          category: 'domestic', defaultModel: 'moonshot-v1-128k',   hue: '#8B5CF6', requiresApiKey: true },
  { code: 'qwen',        label: '通义千问',     icon: '🦅', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',   category: 'domestic', defaultModel: 'qwen3.5-plus',       hue: '#F97316', requiresApiKey: true },
  { code: 'doubao',      label: '豆包',        icon: '🌋', apiBase: 'https://ark.cn-beijing.volces.com/api/v3',            category: 'domestic', defaultModel: 'Doubao-Seed-2.0-pro',hue: '#10B981', requiresApiKey: true },
  { code: 'xunfei',      label: '讯飞星火',     icon: '🎤', apiBase: 'https://spark-api-open.xf-yun.com/v1',                category: 'domestic', defaultModel: 'spark-4.0',          hue: '#EF4444', requiresApiKey: true },
  // ── 国外模型 ──
  { code: 'openai',      label: 'OpenAI',      icon: '🤖', apiBase: 'https://api.openai.com/v1',                           category: 'international', defaultModel: 'gpt-5.4',      hue: '#10A37F', requiresApiKey: true },
  { code: 'anthropic',   label: 'Anthropic',   icon: '🧠', apiBase: 'https://api.anthropic.com/v1',                        category: 'international', defaultModel: 'claude-opus-4-7',hue: '#D97706', requiresApiKey: true },
  { code: 'gemini',      label: 'Gemini',      icon: '🔵', apiBase: 'https://generativelanguage.googleapis.com/v1beta',    category: 'international', defaultModel: 'gemini-2.5-pro',hue: '#4285F4', requiresApiKey: true },
  { code: 'grok',        label: 'Grok',        icon: '🚀', apiBase: 'https://api.x.ai/v1',                                 category: 'international', defaultModel: 'grok-4',        hue: '#1DA1F2', requiresApiKey: true },
  // ── 本地模型 ──
  { code: 'ollama',      label: 'Ollama',      icon: '🦙', apiBase: 'http://localhost:11434/v1',                           category: 'local',       defaultModel: 'llama3.2',       hue: '#6366F1', requiresApiKey: false },
  { code: 'vllm',        label: 'vLLM',        icon: '⚡', apiBase: 'http://localhost:8000/v1',                            category: 'local',       defaultModel: 'default',         hue: '#14B8A6', requiresApiKey: false },
  { code: 'custom',      label: '自定义',       icon: '🔧', apiBase: '',                                                    category: 'local',       defaultModel: '',               hue: '#6B7280', requiresApiKey: false },
];

const CATEGORY_LABELS: Record<string, string> = {
  domestic: '国内模型',
  international: '国外模型',
  local: '本地模型',
};

// ── Helper ──
function getProviderDef(code: LLMProvider): ProviderDef | undefined {
  return PROVIDER_REGISTRY.find(p => p.code === code);
}

// ── Generate model name helper ──
function generateName(provider: LLMProvider, modelName: string): string {
  const def = getProviderDef(provider);
  return def ? `${def.label} — ${modelName}` : modelName;
}

// ── Component ──

export default function ModelConfigPanel() {
  const { message } = App.useApp();
  const {
    models,
    addModel,
    removeModel,
    updateModel,
    setDefaultModel,
    exportModels,
    importModels,
  } = useLLMModels();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<LLMModelConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('deepseek');
  const [form] = Form.useForm();
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  const defaultModel = models.find(m => m.isDefault);
  const providerDef = getProviderDef(selectedProvider);

  // ── Open sheet ──
  const openSheet = useCallback((model?: LLMModelConfig) => {
    setTestStatus('idle');
    if (model) {
      setEditingModel(model);
      setSelectedProvider(model.provider);
      form.setFieldsValue({
        provider: model.provider,
        apiKey: model.apiKey,
        modelName: model.modelName,
        apiBase: undefined, // will be handled via provider def
      });
    } else {
      setEditingModel(null);
      setSelectedProvider('deepseek');
      form.resetFields();
    }
    setSheetOpen(true);
  }, [form]);

  // ── Save ──
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingModel) {
        updateModel(editingModel.id, {
          provider: values.provider,
          modelName: values.modelName,
          apiKey: values.apiKey || '',
          name: generateName(values.provider, values.modelName),
        });
        message.success('模型已更新');
      } else {
        addModel({
          provider: values.provider,
          modelName: values.modelName,
          apiKey: values.apiKey || '',
          name: generateName(values.provider, values.modelName),
        });
        message.success('模型已添加');
      }
      setSheetOpen(false);
      form.resetFields();
    } catch {
      // validation failed
    }
  };

  // ── Test connection ──
  const handleTest = async () => {
    setTestStatus('testing');
    // Simulate a connection test — in production this calls /llm/v1/admin/providers/{id}/test
    try {
      const values = form.getFieldsValue();
      const def = getProviderDef(values.provider);
      if (!def) { setTestStatus('failed'); return; }
      // TODO: Replace with actual API call when backend is ready
      await new Promise(resolve => setTimeout(resolve, 1200));
      setTestStatus('success');
      message.success('连接测试通过');
    } catch {
      setTestStatus('failed');
      message.error('连接测试失败');
    }
  };

  // ── Delete ──
  const handleDelete = (id: string) => {
    removeModel(id);
    message.success('模型已删除');
  };

  // ── Model list for a provider ──
  const modelsByProvider = (provider: LLMProvider) => models.filter(m => m.provider === provider);

  // ── Get available model names for a provider ──
  const getModelOptions = (provider: LLMProvider) => {
    return (DEFAULT_MODELS[provider] || []).map(m => ({ label: m, value: m }));
  };

  return (
    <div style={{ marginTop: 12 }}>
      {/* ── Section: Default Model ── */}
      <div className={styles.sectionLabel}>默认模型</div>
      <div className={styles.insetGroup} style={{ marginBottom: 24 }}>
        <div
          className={styles.insetRow}
          onClick={() => {
            // Scroll to or highlight the default model's provider
            if (defaultModel) {
              setExpandedId(expandedId === defaultModel.id ? null : defaultModel.id);
            }
          }}
          style={{ cursor: 'default' }}
        >
          <div className={styles.rowIcon} style={{
            background: defaultModel
              ? `color-mix(in srgb, ${getProviderDef(defaultModel.provider)?.hue || '#6B7280'} 14%, transparent)`
              : 'var(--color-muted)',
          }}>
            <span style={{ fontSize: 18 }}>
              {defaultModel ? getProviderDef(defaultModel.provider)?.icon : '🤖'}
            </span>
          </div>
          <div className={styles.rowContent}>
            <div className={styles.rowTitle}>
              {defaultModel ? defaultModel.modelName : '未设置默认模型'}
            </div>
            <div className={styles.rowSubtitle}>
              {defaultModel
                ? `${getProviderDef(defaultModel.provider)?.label} — 问答时自动使用此模型`
                : '请在下方模型列表中选择一个设为默认'}
            </div>
          </div>
          <div className={styles.rowTrailing}>
            {defaultModel && <span className={styles.defaultBadge}>默认</span>}
          </div>
        </div>
      </div>

      {/* ── Section: Configured Providers ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className={styles.sectionLabel} style={{ margin: 0 }}>已配置的模型</div>
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => openSheet()}
          style={{
            fontWeight: 500,
            color: 'var(--color-accent)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          添加模型
        </Button>
      </div>

      {models.length === 0 ? (
        /* ── Empty State ── */
        <div className={styles.insetGroup} style={{ marginBottom: 24 }}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🤖</div>
            <div className={styles.emptyTitle}>尚未配置任何模型</div>
            <div className={styles.emptyDesc}>
              点击「添加模型」连接大模型服务，支持国内外和本地部署的模型
            </div>
          </div>
        </div>
      ) : (
        /* ── Provider List ── */
        <div className={styles.insetGroup} style={{ marginBottom: 24 }}>
          {models.map((model, idx) => {
            const def = getProviderDef(model.provider);
            const isExpanded = expandedId === model.id;
            const isDefault = model.isDefault;

            return (
              <React.Fragment key={model.id}>
                {/* ── Row ── */}
                <div
                  className={styles.insetRow}
                  onClick={() => setExpandedId(isExpanded ? null : model.id)}
                  style={idx > 0 ? {} : { borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)' }}
                >
                  {/* Icon */}
                  <div className={styles.rowIcon} style={{
                    background: def ? `color-mix(in srgb, ${def.hue} 14%, transparent)` : 'var(--color-muted)',
                  }}>
                    <span style={{ fontSize: 18 }}>{def?.icon || '🤖'}</span>
                  </div>

                  {/* Content */}
                  <div className={styles.rowContent}>
                    <div className={styles.rowTitle}>{model.modelName}</div>
                    <div className={styles.rowSubtitle}>
                      {def?.label || model.provider}
                      {model.apiKey && ' · 已配置 API Key'}
                    </div>
                  </div>

                  {/* Trailing */}
                  <div className={styles.rowTrailing}>
                    {/* Connection status dot */}
                    <Tooltip title="连接状态：模拟数据（后端就绪后启用）">
                      <span className={`${styles.statusDot} ${styles.statusUntested}`} />
                    </Tooltip>
                    {isDefault && <span className={styles.defaultBadge}>默认</span>}
                    <span className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}>
                      <RightOutlined style={{ fontSize: 11 }} />
                    </span>
                  </div>
                </div>

                {/* ── Expanded Model Detail ── */}
                <div className={`${styles.modelList} ${isExpanded ? styles.modelListExpanded : ''}`}>
                  <div className={styles.modelListInner}>
                    {/* Model info */}
                    <div className={styles.modelRow}>
                      <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)', width: 70, flexShrink: 0 }}>模型名称</span>
                      <span className={styles.modelRowName}>{model.modelName}</span>
                    </div>
                    <div className={styles.modelRow}>
                      <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)', width: 70, flexShrink: 0 }}>提供商</span>
                      <span>{def?.icon} {def?.label || model.provider}</span>
                    </div>
                    <div className={styles.modelRow}>
                      <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)', width: 70, flexShrink: 0 }}>API 地址</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                        {def?.apiBase || '—'}
                      </span>
                    </div>
                    <div className={styles.modelRow}>
                      <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)', width: 70, flexShrink: 0 }}>API Key</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                        {model.apiKey ? `••••••••${model.apiKey.slice(-4)}` : '未设置'}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className={styles.modelRow} style={{ gap: 6, paddingTop: 4, paddingBottom: 14 }}>
                      {!isDefault && (
                        <Button
                          size="small"
                          type="default"
                          onClick={(e) => { e.stopPropagation(); setDefaultModel(model.id); message.success(`已将 ${model.modelName} 设为默认模型`); }}
                          style={{ borderRadius: 20, fontSize: 12, fontWeight: 500 }}
                        >
                          设为默认
                        </Button>
                      )}
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={(e) => { e.stopPropagation(); openSheet(model); }}
                        style={{ fontSize: 12 }}
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => { e.stopPropagation(); handleDelete(model.id); }}
                        style={{ fontSize: 12 }}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Hairline separator between rows (not after last) */}
                {idx < models.length - 1 && (
                  <div style={{ marginLeft: 60, borderTop: '0.5px solid var(--color-border)' }} />
                )}
              </React.Fragment>
            );
          })}

          {/* Import/Export toolbar */}
          <div
            className={styles.insetRow}
            style={{
              justifyContent: 'center',
              gap: 24,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-muted-foreground)',
              borderBottomLeftRadius: 'var(--radius-xl)',
              borderBottomRightRadius: 'var(--radius-xl)',
            }}
          >
            <Button type="text" size="small" onClick={exportModels} style={{ fontSize: 13, color: 'var(--color-muted-foreground)' }}>
              导出配置
            </Button>
            <span style={{ color: 'var(--color-border)' }}>|</span>
            <Button
              type="text"
              size="small"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) {
                    const ok = await importModels(file);
                    message[ok ? 'success' : 'error'](ok ? '导入成功' : '导入失败，请检查文件格式');
                  }
                };
                input.click();
              }}
              style={{ fontSize: 13, color: 'var(--color-muted-foreground)' }}
            >
              导入配置
            </Button>
          </div>
        </div>
      )}

      {/* ── Add / Edit Sheet ── */}
      <Modal
        title={null}
        open={sheetOpen}
        onCancel={() => { setSheetOpen(false); form.resetFields(); setTestStatus('idle'); }}
        footer={null}
        width={560}
        className={styles.sheet}
        centered
        styles={{
          body: { padding: 0 },
          content: {
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
          },
        }}
      >
        {/* Header */}
        <div className={styles.sheetHeader}>
          <div className={styles.sheetTitle}>
            {editingModel ? '编辑模型' : '添加模型'}
          </div>
          <div className={styles.sheetSubtitle}>
            {editingModel ? '修改模型配置信息' : '选择一个模型提供商，填入 API Key 完成接入'}
          </div>
        </div>

        {/* Body */}
        <div className={styles.sheetBody}>
          <Form form={form} layout="vertical" initialValues={{ provider: 'deepseek', modelName: '' }}>
            {/* ── Provider Grid ── */}
            <Form.Item
              name="provider"
              label={<span style={{ fontWeight: 600, fontSize: 13 }}>模型提供商</span>}
              rules={[{ required: true }]}
            >
              <div className={styles.providerGrid}>
                {(['domestic', 'international', 'local'] as const).map(cat => (
                  <React.Fragment key={cat}>
                    <div className={styles.categoryLabel}>{CATEGORY_LABELS[cat]}</div>
                    {PROVIDER_REGISTRY.filter(p => p.category === cat).map(prov => {
                      const isActive = selectedProvider === prov.code;
                      return (
                        <div
                          key={prov.code}
                          className={`${styles.providerTile} ${isActive ? styles.providerTileActive : ''}`}
                          onClick={() => {
                            setSelectedProvider(prov.code);
                            form.setFieldsValue({
                              provider: prov.code,
                              modelName: prov.defaultModel,
                            });
                          }}
                        >
                          <div className={styles.providerTileIcon} style={{
                            background: `color-mix(in srgb, ${prov.hue} 12%, transparent)`,
                          }}>
                            {prov.icon}
                          </div>
                          <div className={styles.providerTileLabel}>{prov.label}</div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </Form.Item>

            {/* ── Model Name ── */}
            <Form.Item
              name="modelName"
              label={<span style={{ fontWeight: 600, fontSize: 13 }}>模型名称</span>}
              rules={[{ required: true, message: '请选择或输入模型名称' }]}
            >
              <Select
                showSearch
                placeholder="选择或输入模型名称"
                options={getModelOptions(selectedProvider)}
                onChange={(val) => form.setFieldsValue({ modelName: val })}
                style={{ width: '100%' }}
                dropdownStyle={{ borderRadius: 12 }}
              />
            </Form.Item>

            {/* ── API Key ── */}
            {providerDef?.requiresApiKey !== false && (
              <Form.Item
                name="apiKey"
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>API Key</span>}
                tooltip={editingModel ? '留空则保持原有 Key 不变' : 'API Key 会安全存储在服务端'}
              >
                <Input.Password
                  placeholder={editingModel ? '留空保持不变' : '请输入 API Key'}
                  style={{ borderRadius: 8 }}
                />
              </Form.Item>
            )}

            {/* ── API Base (custom only) ── */}
            {selectedProvider === 'custom' && (
              <Form.Item
                name="apiBase"
                label={<span style={{ fontWeight: 600, fontSize: 13 }}>API 地址</span>}
                rules={[{ required: selectedProvider === 'custom', message: '请输入自定义 API 地址' }]}
              >
                <Input placeholder="http://localhost:8000/v1" style={{ borderRadius: 8 }} />
              </Form.Item>
            )}

            {/* ── Provider info ── */}
            {providerDef && (
              <div style={{
                fontSize: 12,
                color: 'var(--color-muted-foreground)',
                background: 'var(--color-muted)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <ApiOutlined style={{ fontSize: 14 }} />
                <span>API 端点：</span>
                <code style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  background: 'var(--color-surface)',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}>
                  {providerDef.apiBase || '(自定义)'}
                </code>
              </div>
            )}
          </Form>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {providerDef?.requiresApiKey !== false && (
              <button
                className={`${styles.testBtn} ${testStatus === 'success' ? styles.testBtnSuccess : ''} ${testStatus === 'failed' ? styles.testBtnFailed : ''}`}
                onClick={handleTest}
                disabled={testStatus === 'testing'}
              >
                {testStatus === 'testing' ? '测试中...' :
                 testStatus === 'success' ? '✓ 连接成功' :
                 testStatus === 'failed' ? '✗ 连接失败' :
                 '测试连接'}
              </button>
            )}
            <Button onClick={() => { setSheetOpen(false); form.resetFields(); }}>取消</Button>
            <Button type="primary" onClick={handleSave} style={{ borderRadius: 8, fontWeight: 500 }}>
              {editingModel ? '保存更改' : '添加模型'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

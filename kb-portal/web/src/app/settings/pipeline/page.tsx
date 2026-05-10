'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Switch,
  Button,
  Space,
  Slider,
  Select,
  App,
} from 'antd';
import {
  AppstoreOutlined,
  CheckCircleFilled,
  ThunderboltOutlined,
  SettingOutlined,
  FireOutlined,
} from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';

const { Title, Text } = Typography;

interface StepConfig {
  enabled: boolean;
  [key: string]: boolean | number | string;
}

interface PipelineConfig {
  parse: StepConfig;
  clean: StepConfig;
  chunk: StepConfig;
  vectorize: StepConfig;
  index: StepConfig;
  complete: StepConfig;
}

const DEFAULT_CONFIG: PipelineConfig = {
  parse: { enabled: true, ocr: true, extractToc: true, headerFooter: true },
  clean: { enabled: true, deduplicate: true, removeEmpty: true, sensitiveFilter: false },
  chunk: { enabled: true, strategy: 'SMART', chunkSize: 512, overlapRatio: 10 },
  vectorize: { enabled: true, model: 'bge-zh-v1.5', dimension: 1024 },
  index: { enabled: true, collection: 'knowledge_v1', indexType: 'HNSW' },
  complete: { enabled: true, notifySuccess: true, notifyFail: true },
};

const STEPS = [
  { key: 'parse', label: '解析', description: '文档格式识别与内容提取', color: '#3B82F6' },
  { key: 'clean', label: '清洗', description: '数据规范化与质量过滤', color: '#10B981' },
  { key: 'chunk', label: '切片', description: '文档切分与语义分段', color: '#8B5CF6' },
  { key: 'vectorize', label: '向量化', description: '文本 embedding 生成', color: '#F59E0B' },
  { key: 'index', label: '入库', description: '向量数据写入 Milvus', color: '#EF4444' },
  { key: 'complete', label: '完成', description: '索引构建与状态更新', color: '#06B6D4' },
] as const;

const STEP_CONFIG_FIELDS: Record<string, { key: string; label: string; type: 'switch' | 'slider' | 'select'; min?: number; max?: number; step?: number; suffix?: string; options?: { label: string; value: string }[] }[]> = {
  parse: [
    { key: 'ocr', label: '启用 OCR 识别', type: 'switch' },
    { key: 'extractToc', label: '自动提取目录结构', type: 'switch' },
    { key: 'headerFooter', label: '页眉页脚处理', type: 'switch' },
  ],
  clean: [
    { key: 'deduplicate', label: '去重检测', type: 'switch' },
    { key: 'removeEmpty', label: '清理空行与冗余空白', type: 'switch' },
    { key: 'sensitiveFilter', label: '敏感词过滤', type: 'switch' },
  ],
  chunk: [
    { key: 'strategy', label: '切分策略', type: 'select', options: [
      { label: '智能切分（推荐）', value: 'SMART' },
      { label: '均匀切分', value: 'UNIFORM' },
      { label: '从前到后', value: 'HEAD_FIRST' },
      { label: '从后到前', value: 'TAIL_FIRST' },
    ]},
    { key: 'chunkSize', label: '段落最大长度', type: 'slider', min: 256, max: 1024, step: 64, suffix: '字符' },
    { key: 'overlapRatio', label: '重叠率', type: 'slider', min: 0, max: 30, step: 5, suffix: '%' },
  ],
  vectorize: [
    { key: 'model', label: 'Embedding 模型', type: 'select', options: [
      { label: 'BGE 中文 v1.5', value: 'bge-zh-v1.5' },
      { label: 'BGE 中文 v1.5 (large)', value: 'bge-zh-v1.5-large' },
      { label: 'text2vec large', value: 'text2vec-large' },
    ]},
    { key: 'dimension', label: '向量维度', type: 'select', options: [
      { label: '1024 维（推荐）', value: '1024' },
      { label: '768 维', value: '768' },
      { label: '1536 维', value: '1536' },
    ]},
  ],
  index: [
    { key: 'collection', label: '目标 Collection', type: 'select', options: [
      { label: 'knowledge_v1（默认）', value: 'knowledge_v1' },
      { label: 'knowledge_v2', value: 'knowledge_v2' },
      { label: 'knowledge_archive', value: 'knowledge_archive' },
    ]},
    { key: 'indexType', label: '索引类型', type: 'select', options: [
      { label: 'HNSW（高精度）', value: 'HNSW' },
      { label: 'IVF-FLAT', value: 'IVF_FLAT' },
      { label: 'FLAT（暴力搜索）', value: 'FLAT' },
    ]},
  ],
  complete: [
    { key: 'notifySuccess', label: '成功后发送通知', type: 'switch' },
    { key: 'notifyFail', label: '失败后发送通知', type: 'switch' },
  ],
};

const STORAGE_KEY = 'kb_pipeline_config';

export default function PipelinePage() {
  const { message: msg } = App.useApp();
  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_CONFIG);
  const [activeStep, setActiveStep] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  const handleToggle = (stepKey: string, checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      [stepKey]: { ...prev[stepKey as keyof PipelineConfig], enabled: checked },
    }));
  };

  const handleFieldChange = (stepKey: string, fieldKey: string, value: boolean | number | string) => {
    setConfig(prev => ({
      ...prev,
      [stepKey]: { ...prev[stepKey as keyof PipelineConfig], [fieldKey]: value },
    }));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    msg.success('流水线配置已保存');
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem(STORAGE_KEY);
    setActiveStep(null);
    msg.info('已恢复默认配置');
  };

  const enabledCount = STEPS.filter(s => config[s.key as keyof PipelineConfig]?.enabled).length;

  return (
    <AppLayout>
      <div style={{ marginBottom: 24 }}>
        <Space>
          <AppstoreOutlined style={{ fontSize: 22, color: 'var(--color-primary)' }} />
          <Title level={4} style={{ margin: 0 }}>流水线配置</Title>
        </Space>
      </div>

      {/* Pipeline card */}
      <Card
        style={{
          borderRadius: 16,
          border: 'none',
          background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
          marginBottom: 20,
        }}
        styles={{ body: { padding: '32px 32px 24px' } }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
            }}>
              <ThunderboltOutlined style={{ color: '#fff', fontSize: 20 }} />
            </div>
            <div>
              <Text style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-foreground)', display: 'block', letterSpacing: '-0.01em' }}>
                文档处理流水线
              </Text>
              <Text style={{ fontSize: 12, color: 'var(--color-secondary)' }}>
                启用 {enabledCount} / {STEPS.length} 个阶段
              </Text>
            </div>
          </div>
          <div style={{
            padding: '6px 14px',
            borderRadius: 20,
            background: enabledCount === STEPS.length
              ? 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(6,182,212,0.1))'
              : 'rgba(100,116,139,0.08)',
            border: `1px solid ${enabledCount === STEPS.length ? 'rgba(37,99,235,0.2)' : 'rgba(100,116,139,0.15)'}`,
          }}>
            <Text style={{
              fontSize: 12,
              fontWeight: 600,
              color: enabledCount === STEPS.length ? '#2563EB' : '#64748B',
              letterSpacing: '0.02em',
            }}>
              {enabledCount === STEPS.length ? '● 全部启用' : '○ 部分启用'}
            </Text>
          </div>
        </div>

        {/* Pipeline steps */}
        <div style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          gap: 0,
        }}>
          {STEPS.map((step, idx) => {
            const stepConfig = config[step.key as keyof PipelineConfig];
            const isEnabled = stepConfig?.enabled ?? true;
            const isActive = activeStep === step.key;

            return (
              <React.Fragment key={step.key}>
                {/* Step card */}
                <div
                  onClick={() => setActiveStep(isActive ? null : step.key)}
                  style={{
                    width: 128,
                    borderRadius: 16,
                    padding: '18px 10px 16px',
                    background: isActive
                      ? `linear-gradient(160deg, ${step.color}08 0%, ${step.color}15 100%)`
                      : 'rgba(255,255,255,0.9)',
                    border: isActive
                      ? `2px solid ${step.color}50`
                      : '2px solid rgba(0,0,0,0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    boxShadow: isActive
                      ? `0 12px 32px ${step.color}25, 0 4px 12px rgba(0,0,0,0.06)`
                      : '0 2px 8px rgba(0,0,0,0.04)',
                    transform: isActive ? 'translateY(-6px)' : 'none',
                  }}
                >
                  {/* Top glow bar */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: isActive ? '70%' : '0%',
                    height: 3,
                    background: `linear-gradient(90deg, transparent, ${step.color}, transparent)`,
                    borderRadius: '0 0 4px 4px',
                    transition: 'width 0.3s ease',
                    opacity: isActive ? 1 : 0,
                  }} />

                  {/* Icon circle */}
                  <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: isEnabled
                      ? `linear-gradient(145deg, ${step.color} 0%, ${step.color}bb 100%)`
                      : 'linear-gradient(145deg, #CBD5E1 0%, #94A3B8 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    boxShadow: isEnabled ? `0 6px 20px ${step.color}40` : '0 2px 6px rgba(0,0,0,0.1)',
                    transition: 'all 0.25s ease',
                  }}>
                    <CheckCircleFilled style={{ color: '#fff', fontSize: 24 }} />
                  </div>

                  {/* Label */}
                  <Text style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: isEnabled ? 'var(--color-foreground)' : '#94A3B8',
                    display: 'block',
                    textAlign: 'center',
                    marginBottom: 4,
                    letterSpacing: '0.01em',
                  }}>
                    {step.label}
                  </Text>
                  <Text style={{
                    fontSize: 10,
                    color: isEnabled ? 'var(--color-secondary)' : '#CBD5E1',
                    display: 'block',
                    textAlign: 'center',
                    lineHeight: 1.4,
                    padding: '0 4px',
                  }}>
                    {step.description}
                  </Text>

                  {/* Switch */}
                  <div
                    style={{ position: 'absolute', top: 10, right: 10 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Switch
                      size="small"
                      checked={isEnabled}
                      onChange={(checked) => handleToggle(step.key, checked)}
                      style={{ background: isEnabled ? step.color : undefined }}
                    />
                  </div>
                </div>

                {/* Connector */}
                {idx < STEPS.length - 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    paddingBottom: 30,
                    paddingLeft: 6,
                    paddingRight: 6,
                  }}>
                    <div style={{
                      width: 32,
                      height: 2,
                      background: (config[STEPS[idx + 1].key as keyof PipelineConfig]?.enabled ?? true)
                        ? `linear-gradient(90deg, ${step.color}50, ${STEPS[idx + 1].color}50)`
                        : '#E2E8F0',
                      borderRadius: 2,
                      position: 'relative',
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: -3,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: (config[STEPS[idx + 1].key as keyof PipelineConfig]?.enabled ?? true)
                          ? step.color
                          : '#CBD5E1',
                        boxShadow: (config[STEPS[idx + 1].key as keyof PipelineConfig]?.enabled ?? true)
                          ? `0 0 8px ${step.color}`
                          : 'none',
                      }} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Config detail panel */}
      {activeStep && (() => {
        const step = STEPS.find(s => s.key === activeStep)!;
        const fields = STEP_CONFIG_FIELDS[activeStep] || [];

        return (
          <Card
            style={{
              borderRadius: 16,
              border: 'none',
              background: `linear-gradient(160deg, ${step.color}06 0%, #ffffff 60%)`,
              boxShadow: `0 8px 32px ${step.color}15`,
              marginBottom: 20,
              animation: 'panelSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            styles={{ body: { padding: '28px 32px' } }}
          >
            {/* Panel header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 24,
              paddingBottom: 18,
              borderBottom: `1px solid ${step.color}18`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `linear-gradient(145deg, ${step.color} 0%, ${step.color}cc 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 6px 20px ${step.color}35`,
                }}>
                  <SettingOutlined style={{ color: '#fff', fontSize: 20 }} />
                </div>
                <div>
                  <Text style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-foreground)', display: 'block' }}>
                    {step.label}阶段配置
                  </Text>
                  <Text style={{ fontSize: 12, color: 'var(--color-secondary)' }}>
                    {step.description}
                  </Text>
                </div>
              </div>
              <Button
                type="text"
                onClick={() => setActiveStep(null)}
                style={{ color: 'var(--color-secondary)', fontSize: 13 }}
              >
                收起详情
              </Button>
            </div>

            {/* Config fields */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}>
              {fields.map(field => {
                const value = config[activeStep as keyof PipelineConfig]?.[field.key];

                if (field.type === 'switch') {
                  return (
                    <div
                      key={field.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        background: '#fff',
                        borderRadius: 12,
                        border: `1px solid ${value ? `${step.color}30` : 'var(--color-border)'}`,
                        boxShadow: `0 2px 8px ${value ? `${step.color}08` : 'rgba(0,0,0,0.03)'}`,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: 500 }}>{field.label}</Text>
                      <Switch
                        checked={value as boolean}
                        onChange={(checked) => handleFieldChange(activeStep, field.key, checked)}
                        style={{ background: value ? step.color : undefined }}
                      />
                    </div>
                  );
                }

                if (field.type === 'select') {
                  return (
                    <div
                      key={field.key}
                      style={{
                        padding: '14px 18px',
                        background: '#fff',
                        borderRadius: 12,
                        border: `1px solid ${step.color}20`,
                        boxShadow: `0 2px 8px ${step.color}06`,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: 'var(--color-secondary)', display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {field.label}
                      </Text>
                      <Select
                        value={value as string}
                        onChange={(val) => handleFieldChange(activeStep, field.key, val)}
                        options={field.options}
                        style={{ width: '100%' }}
                        popupMatchSelectWidth={false}
                      />
                    </div>
                  );
                }

                if (field.type === 'slider') {
                  return (
                    <div
                      key={field.key}
                      style={{
                        padding: '14px 18px',
                        background: '#fff',
                        borderRadius: 12,
                        border: `1px solid ${step.color}20`,
                        boxShadow: `0 2px 8px ${step.color}06`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, color: 'var(--color-secondary)', fontWeight: 500 }}>{field.label}</Text>
                        <Text style={{ fontSize: 14, fontWeight: 700, color: step.color }}>
                          {value}{field.suffix}
                        </Text>
                      </div>
                      <Slider
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={value as number}
                        onChange={(val) => handleFieldChange(activeStep, field.key, val)}
                        trackStyle={{ background: step.color }}
                        railStyle={{ background: `${step.color}25` }}
                        handleStyle={{ borderColor: step.color, boxShadow: `0 2px 8px ${step.color}40` }}
                      />
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </Card>
        );
      })()}

      {/* Action bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FireOutlined style={{ color: '#F59E0B', fontSize: 14 }} />
          <Text style={{ fontSize: 13, color: 'var(--color-secondary)' }}>
            配置变更后需保存才能生效
          </Text>
        </div>
        <Space>
          <Button
            onClick={handleReset}
            style={{ borderRadius: 8 }}
          >
            恢复默认
          </Button>
          <Button
            type="primary"
            onClick={handleSave}
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
              border: 'none',
              borderRadius: 8,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              fontWeight: 600,
            }}
          >
            保存配置
          </Button>
        </Space>
      </div>

      <style>{`
        @keyframes panelSlideIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </AppLayout>
  );
}

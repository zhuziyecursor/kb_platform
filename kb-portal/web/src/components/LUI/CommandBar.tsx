'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Input,
  Card,
  Typography,
  Space,
  Tag,
  Badge,
  Spin,
  Tooltip,
  Divider,
} from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  SoundOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type { LUIAction, LUICommandResult, Skill } from '@/types';

const { Text, Paragraph } = Typography;

// ============== 内置 Skill 定义 ==============
const AVAILABLE_SKILLS: Skill[] = [
  {
    id: 'skill-upload',
    name: '文档上传',
    description: '打开文档上传界面，选择文件并配置元数据',
    icon: '📤',
    category: 'upload',
  },
  {
    id: 'skill-reparse',
    name: '重新解析',
    description: '对指定文档重新执行解析、清洗、切片流程',
    icon: '🔄',
    category: 'document',
  },
  {
    id: 'skill-doc-status',
    name: '查询文档状态',
    description: '查看文档当前的处理进度和状态',
    icon: '📋',
    category: 'document',
  },
  {
    id: 'skill-rag-query',
    name: '知识问答',
    description: '在知识库中检索相关文档并生成带引用的答案',
    icon: '🤖',
    category: 'rag',
  },
  {
    id: 'skill-doc-cleanup',
    name: '文档清理',
    description: '清理失败或过期的文档记录',
    icon: '🧹',
    category: 'system',
  },
];

// ============== 意图关键词匹配表（静态版本） ==============
const INTENT_PATTERNS: Array<{
  intent: string;
  patterns: RegExp[];
  actionType: LUIAction['type'];
  defaultPayload: Record<string, unknown>;
}> = [
  {
    intent: '上传文档',
    patterns: [/上传/i, /传.*文件/i, /添加.*文档/i, /upload/i, /提交.*文档/i],
    actionType: 'OPEN_MODAL',
    defaultPayload: { modal: 'upload' },
  },
  {
    intent: '知识问答',
    patterns: [/问答/i, /搜索/i, /检索/i, /query/i, /提问/i, /问.*问题/i, /查找.*相关/i],
    actionType: 'NAVIGATE',
    defaultPayload: { path: '/rag' },
  },
  {
    intent: '查询文档状态',
    patterns: [/状态/i, /进度/i, /查看.*文档/i, /哪个.*处理/i, /status/i],
    actionType: 'NAVIGATE',
    defaultPayload: { path: '/documents' },
  },
  {
    intent: '执行Skill',
    patterns: [/调用.*技能/i, /执行.*skill/i, /skill/i, /技能/i],
    actionType: 'CALL_SKILL',
    defaultPayload: {},
  },
  {
    intent: '文档列表',
    patterns: [/文档列表/i, /所有文档/i, /文档管理/i, /documents/i, /list/i],
    actionType: 'NAVIGATE',
    defaultPayload: { path: '/documents' },
  },
];

// ============== LUI Command Bar Component ==============
interface CommandBarProps {
  onAction?: (action: LUIAction) => void;
  placeholder?: string;
}

export default function CommandBar({
  onAction,
  placeholder = '输入自然语言指令，或输入 / 唤起 Skill 面板...',
}: CommandBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<LUICommandResult | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 键盘快捷键 Ctrl+K / Cmd+K 唤起
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setResult(null);
        setInput('');
        setSkillPanelOpen(false);
      }
      // "/" 快速唤起 Skill 面板
      if (e.key === '/' && isOpen && input === '') {
        e.preventDefault();
        setSkillPanelOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, input]);

  // 静态意图匹配（未来替换为大模型调用）
  const matchIntent = useCallback((text: string): LUICommandResult => {
    const trimmed = text.trim();
    if (!trimmed) return { action: null, suggestions: [], response: '' };

    // 检查是否调用 Skill
    if (trimmed.startsWith('/')) {
      const skillId = trimmed.slice(1).trim();
      const skill = AVAILABLE_SKILLS.find(
        (s) => s.id === `skill-${skillId}` || s.name.includes(skillId)
      );
      if (skill) {
        return {
          action: {
            type: 'CALL_SKILL',
            payload: { skillId: skill.id, skill },
            confidence: 1.0,
            matchedIntent: `调用技能: ${skill.name}`,
          },
          suggestions: AVAILABLE_SKILLS.map((s) => `/${s.id.replace('skill-', '')}`),
          response: `✓ 检测到 Skill 调用意图：${skill.name}`,
        };
      }
    }

    // 关键词模式匹配
    for (const { intent, patterns, actionType, defaultPayload } of INTENT_PATTERNS) {
      if (patterns.some((p) => p.test(trimmed))) {
        return {
          action: {
            type: actionType,
            payload: defaultPayload,
            confidence: 0.9,
            matchedIntent: intent,
          },
          suggestions: [],
          response: `✓ 理解你的意图：${intent}`,
        };
      }
    }

    return {
      action: null,
      suggestions: ['上传文档', '知识问答', '查询文档状态', '文档列表'],
      response: '抱歉，我暂时无法理解这个指令。你可以尝试：上传文档、知识问答、查询文档状态 等。',
    };
  }, []);

  // 提交处理
  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    setResult(null);

    // 模拟大模型处理延迟（100-400ms）
    await new Promise((r) => setTimeout(r, Math.random() * 300 + 100));

    const matched = matchIntent(input);
    setResult(matched);
    setIsProcessing(false);
    setShowSuggestions(true);

    // 触发回调
    if (matched.action?.type === 'CALL_SKILL') {
      const skill = matched.action.payload.skill as Skill;
      setInput(`已调用技能: ${skill.name}`);
    }
  }, [input, matchIntent]);

  // Skill 点击触发
  const handleSkillClick = useCallback(
    (skill: Skill) => {
      const action: LUIAction = {
        type: 'CALL_SKILL',
        payload: { skillId: skill.id, skill },
        confidence: 1.0,
        matchedIntent: `调用技能: ${skill.name}`,
      };
      setInput(`/${skill.id.replace('skill-', '')}`);
      setSkillPanelOpen(false);
      onAction?.(action);
    },
    [onAction]
  );

  // 建议点击
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setInput(suggestion);
      setShowSuggestions(false);
      setResult(null);
      inputRef.current?.focus();
    },
    []
  );

  if (!isOpen) {
    // 悬浮触发按钮
    return (
      <div
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          cursor: 'pointer',
        }}
      >
        <Tooltip title="智能指令 (Ctrl+K)">
          <Badge count={1} size="small">
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-primary) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <RobotOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
          </Badge>
        </Tooltip>
      </div>
    );
  }

  return (
    <>
      {/* 半透明遮罩 */}
      <div
        onClick={() => {
          setIsOpen(false);
          setResult(null);
          setInput('');
          setSkillPanelOpen(false);
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 1000,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* 命令条主体 */}
      <div
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(680px, 95vw)',
          zIndex: 1001,
          animation: 'luibar-in 0.2s ease-out',
        }}
      >
        <style>{`
          @keyframes luibar-in {
            from { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(0.97); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
          }
        `}</style>

        <Card
          bordered={false}
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
          styles={{ body: { padding: 0 } }}
        >
          {/* 输入行 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 16px',
              gap: 12,
              borderBottom: result ? '1px solid var(--color-border)' : 'none',
            }}
          >
            <RobotOutlined style={{ fontSize: 20, color: 'var(--color-accent)', flexShrink: 0 }} />
            <Input
              ref={inputRef as React.RefObject<any>}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setResult(null);
                setShowSuggestions(false);
                setSkillPanelOpen(false);
              }}
              onPressEnter={handleSubmit}
              placeholder={placeholder}
              variant="borderless"
              style={{ fontSize: 15, flex: 1 }}
              suffix={
                isProcessing ? (
                  <Spin indicator={<LoadingOutlined spin />} size="small" />
                ) : (
                  <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                    Enter ↵
                  </Tag>
                )
              }
            />
            {isProcessing && (
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                正在解析指令...
              </Text>
            )}
          </div>

          {/* 理解结果反馈 */}
          {result && (
            <div style={{ padding: '12px 16px', background: 'var(--color-muted)' }}>
              <Space>
                {result.action ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">
                    识别成功
                  </Tag>
                ) : (
                  <Tag icon={<QuestionCircleOutlined />} color="default">
                    未能识别
                  </Tag>
                )}
                {result.action && (
                  <Tag icon={<ArrowUpOutlined />} color="processing">
                    置信度 {Math.round(result.action.confidence * 100)}%
                  </Tag>
                )}
              </Space>
              <Paragraph
                type="secondary"
                style={{ margin: '8px 0 0', fontSize: 13 }}
              >
                {result.response}
              </Paragraph>

              {result.suggestions.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    建议尝试：
                  </Text>
                  <Space style={{ marginTop: 4 }} wrap>
                    {result.suggestions.map((s) => (
                      <Tag
                        key={s}
                        onClick={() => handleSuggestionClick(s)}
                        style={{ cursor: 'pointer' }}
                      >
                        {s}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}

              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <Tag
                  icon={<ThunderboltOutlined />}
                  color={result.action ? 'blue' : 'default'}
                  style={{ cursor: result.action ? 'pointer' : 'not-allowed' }}
                  onClick={() => result.action && onAction?.(result.action)}
                >
                  执 行
                </Tag>
              </div>
            </div>
          )}

          {/* Skill 快捷面板 */}
          {skillPanelOpen && (
            <div style={{ padding: '12px 16px' }}>
              <Text strong style={{ fontSize: 13, color: '#888' }}>
                可用技能 (输入 /技能名 直接调用)
              </Text>
              <Divider style={{ margin: '8px 0' }} />
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                {AVAILABLE_SKILLS.map((skill) => (
                  <div
                    key={skill.id}
                    onClick={() => handleSkillClick(skill)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background = 'var(--color-muted)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.background = 'transparent')
                    }
                  >
                    <Text style={{ fontSize: 16 }}>{skill.icon}</Text>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 13 }}>
                        {skill.name}
                      </Text>
                      <Paragraph
                        type="secondary"
                        style={{ margin: 0, fontSize: 12 }}
                      >
                        {skill.description}
                      </Paragraph>
                    </div>
                    <Tag
                      color={skill.category === 'upload' ? 'blue' : skill.category === 'rag' ? 'purple' : 'cyan'}
                      style={{ fontSize: 11 }}
                    >
                      {skill.category}
                    </Tag>
                  </div>
                ))}
              </Space>
            </div>
          )}

          {/* 底部提示 */}
          <div
            style={{
              padding: '8px 16px',
              background: 'var(--color-muted)',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                <SoundOutlined /> 自然语言
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                /
                <Text
                  code
                  style={{ fontSize: 11 }}
                  copyable={false}
                >
                  skill
                </Text>{' '}
                调用技能
              </Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Esc 关闭 · Ctrl+K 唤起
            </Text>
          </div>
        </Card>
      </div>
    </>
  );
}

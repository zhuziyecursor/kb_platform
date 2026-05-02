'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Card,
  Typography,
  Space,
  Input,
  Button,
  Avatar,
  List,
  Tag,
  Spin,
  message,
  Collapse,
  Tooltip,
} from 'antd';
import {
  RobotOutlined,
  UserOutlined,
  SendOutlined,
  BookOutlined,
  CopyOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { ChatMessage, Citation } from '@/types';
import CommandBar from '@/components/LUI/CommandBar';
import AppLayout from '@/components/AppLayout';
import type { LUIAction } from '@/types';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const MOCK_CITATIONS: Citation[] = [
  {
    docId: 'DOC20260401001',
    chunkSeq: 3,
    title: '2026年采购管理办法',
    version: 3,
    page: 5,
    sectionPath: '1/1.2/1.2.3',
    regionCode: 'CN-NATIONAL',
    effectiveFrom: '2026-01-01',
    isCurrent: true,
    score: 0.89,
    text: '采购合同应按照以下流程审批：①需求部门提出采购申请 → ②部门负责人初审 → ③采购部门复核 → ④财务预算审核 → ⑤分管领导审批 → ⑥法务合规审查 → ⑦总经理/董事长最终审批。',
  },
  {
    docId: 'DOC20260425005',
    chunkSeq: 7,
    title: '合同审批流程指引',
    version: 5,
    page: 3,
    sectionPath: '2/2.1',
    regionCode: 'CN-EAST',
    effectiveFrom: '2026-04-25',
    isCurrent: true,
    score: 0.76,
    text: '合同审批实行分级授权：10万以下由部门负责人审批；10-50万需分管领导会签；50万以上须经总经理办公会审议。',
  },
];

const MOCK_RESPONSES = [
  '根据《2026年采购管理办法》v3 和《合同审批流程指引》v5，采购合同审批流程如下：\n\n**适用流程（金额分级）：**\n\n| 金额区间 | 审批节点 |\n|---------|---------|\n| < 10万 | 部门负责人 |\n| 10-50万 | 分管领导会签 |\n| > 50万 | 总经理办公会 |\n\n**完整流程：**\n需求部门发起 → 部门负责人初审 → 采购部门复核 → 财务预算审核 → 分管领导审批 → 法务合规审查 → 最终审批。\n\n> 以上内容来源于 2 篇有效文档，地域覆盖：全国/华东。',
];

export default function RAGPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleLUIAction = useCallback((action: LUIAction) => {
    if (action.type === 'NAVIGATE' && action.payload.path === '/rag') {
      message.success('已导航到知识问答页面');
    }
    if (action.type === 'CALL_SKILL') {
      const skill = action.payload.skill as { name: string };
      message.success(`已调用技能：${skill?.name || '未知'}`);
      if (skill?.name === '知识问答') {
        setTimeout(() => inputRef.current?.focus(), 300);
      }
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: MOCK_RESPONSES[0],
      citations: MOCK_CITATIONS,
      traceId: `tr-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);
  }, [input]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    });
  };

  return (
    <AppLayout contentStyle={{ padding: 0, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CommandBar onAction={handleLUIAction} />

      <div style={{ padding: '20px 32px 0', flexShrink: 0 }}>
        <Space>
          <RobotOutlined style={{ fontSize: 20, color: 'var(--color-primary)' }} />
          <Title level={4} style={{ margin: 0 }}>知识问答</Title>
          <Tag color="purple">RAG + LLM</Tag>
        </Space>
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 2 }}>
          基于知识库文档，返回带引用的可信答案
        </Text>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 32px', minHeight: 0, overflow: 'hidden' }}>
        <Card
          style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', minHeight: 0 }}
          styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' } }}
        >
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }} role="log">
            {messages.length === 0 && !isLoading && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12,
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'var(--color-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <RobotOutlined style={{ fontSize: 28, color: 'var(--color-primary)' }} />
                </div>
                <Text style={{ color: 'var(--color-secondary)', fontSize: 14 }}>
                  开始提问吧，例如：
                </Text>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['采购合同审批流程', '信息安全制度有哪些', '绩效考核如何计算'].map((q) => (
                    <Tag key={q} onClick={() => setInput(q)} style={{ cursor: 'pointer', padding: '4px 12px', fontSize: 13 }} color="processing">
                      {q}
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                }}
              >
                <Avatar
                  icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  style={{
                    background: msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-primary)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ maxWidth: '75%', minWidth: 0 }}>
                  <div style={{ marginBottom: 4, display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <Text strong style={{ fontSize: 13 }}>
                      {msg.role === 'user' ? '你' : '知识库助手'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {dayjs(msg.timestamp).format('HH:mm')}
                    </Text>
                  </div>

                  <div style={{
                    padding: '12px 16px',
                    background: msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-muted)',
                    color: msg.role === 'user' ? '#fff' : 'var(--color-foreground)',
                    borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    lineHeight: 1.75,
                    fontSize: 14,
                  }}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0 }}>
                      {msg.content}
                    </pre>
                  </div>

                  {msg.citations && msg.citations.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <Collapse
                        ghost
                        size="small"
                        items={[{
                          key: '1',
                          label: (
                            <Space size={4}>
                              <BookOutlined style={{ fontSize: 12 }} />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {msg.citations.length} 篇引用来源
                              </Text>
                              {msg.traceId && (
                                <Text type="secondary" style={{ fontSize: 10 }} code>
                                  {msg.traceId}
                                </Text>
                              )}
                            </Space>
                          ),
                          children: (
                            <List
                              size="small"
                              dataSource={msg.citations}
                              renderItem={(cite, index) => (
                                <List.Item style={{ padding: '10px 0', borderBottom: index < msg.citations!.length - 1 ? '1px dashed var(--color-border)' : 'none' }}>
                                  <div style={{ width: '100%' }}>
                                    <Space size={4} style={{ marginBottom: 6 }} wrap>
                                      <Tag color="blue" style={{ fontSize: 11 }}>#{index + 1}</Tag>
                                      <Text strong style={{ fontSize: 13 }}>{cite.title}</Text>
                                      <Text type="secondary" style={{ fontSize: 11 }}>
                                        v{cite.version} · 第{cite.page}页 · {cite.sectionPath}
                                      </Text>
                                      <Tag color="green" style={{ fontSize: 10 }}>
                                        {(cite.score * 100).toFixed(0)}%
                                      </Tag>
                                      <Tooltip title="复制引用文本">
                                        <Button type="text" size="small" icon={<CopyOutlined style={{ fontSize: 12 }} />} onClick={() => copyToClipboard(cite.text)} />
                                      </Tooltip>
                                    </Space>
                                    <Paragraph
                                      type="secondary"
                                      style={{
                                        margin: 0, fontSize: 12, padding: '8px 10px',
                                        background: 'var(--color-muted)', borderRadius: 6,
                                        borderLeft: '3px solid var(--color-accent)',
                                      }}
                                    >
                                      {cite.text}
                                    </Paragraph>
                                  </div>
                                </List.Item>
                              )}
                            />
                          ),
                        }]}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', gap: 12 }}>
                <Avatar icon={<RobotOutlined />} style={{ background: 'var(--color-primary)', flexShrink: 0 }} />
                <div style={{ padding: '12px 16px', background: 'var(--color-muted)', borderRadius: '4px 16px 16px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Spin size="small" />
                  <Text type="secondary" style={{ fontSize: 13 }}>正在检索知识库并生成答案...</Text>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop: '1px solid var(--color-border)', padding: '16px 24px', background: 'var(--color-surface)', flexShrink: 0 }}>
            <Space.Compact style={{ width: '100%' }}>
              <TextArea
                ref={inputRef as React.RefObject<any>}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="输入你的问题... (Shift+Enter 换行，Enter 发送)"
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{ borderRadius: '8px 0 0 8px' }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={isLoading}
                disabled={!input.trim()}
                style={{ height: 'auto', minHeight: 36, borderRadius: '0 8px 8px 0' }}
              >
                发送
              </Button>
            </Space.Compact>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={4}>
                <HistoryOutlined style={{ fontSize: 12, color: 'var(--color-secondary)' }} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {messages.length > 0 ? `${messages.length} 条对话` : '新对话'}
                </Text>
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                回答基于知识库文档，带有引用标注
              </Text>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}

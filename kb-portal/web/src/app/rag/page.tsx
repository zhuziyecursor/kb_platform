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
  App,
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
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ChatMessage } from '@/types';
import { ragChat } from '@/api/http-client';
import CommandBar from '@/components/LUI/CommandBar';
import AppLayout from '@/components/AppLayout';
import type { LUIAction } from '@/types';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const DEV_TENANT_ID = 'dev-tenant-001';

export default function RAGPage() {
  const { message } = App.useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
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
    const currentQuery = input;
    setInput('');
    setIsLoading(true);

    try {
      const response = await ragChat({
        tenantId: DEV_TENANT_ID,
        query: currentQuery,
        sessionId,
        lang: 'zh',
      });

      if (response.sessionId) {
        setSessionId(response.sessionId);
      }

      const refusalMessages: Record<string, string> = {
        NO_MATCH: '知识库中暂时没有找到相关资料',
        NO_PERMISSION: '您没有权限查看相关内容',
        LOW_CONFIDENCE: '知识库中暂时没有找到相关资料',
      };

      const displayContent = response.reason
        ? refusalMessages[response.reason] || response.answer
        : response.answer;

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: displayContent,
        citations: (response.citations || []).map((c) => ({
          ...c,
          sectionPath: c.sectionPath || '',
          regionCode: c.regionCode || '',
          effectiveFrom: c.effectiveFrom || '',
          effectiveTo: c.effectiveTo,
        })),
        traceId: response.traceId,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `抱歉，服务暂时不可用：${err?.message || '未知错误'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, sessionId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    });
  };

  return (
    <AppLayout contentStyle={{ padding: 0 }}>
      <CommandBar onAction={handleLUIAction} />

      {/* Header */}
      <div style={{
        padding: '20px 32px 16px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <Space align="center">
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--color-accent) 0%, #3B82F6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <RobotOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, fontSize: 16 }}>知识问答</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              基于知识库文档，返回带引用的可信答案
            </Text>
          </div>
        </Space>
      </div>

      {/* Chat Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 32px 24px',
        minHeight: 0,
        overflow: 'auto',
      }}>
        {/* Centered Content Container */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 900,
          margin: '0 auto',
          width: '100%',
          minHeight: 0,
        }}>
          {/* Messages Container */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }} role="log">

            {/* Empty State - DeepSeek Style */}
            {messages.length === 0 && !isLoading && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 24,
              }}>
                {/* Logo */}
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: 'linear-gradient(135deg, var(--color-accent) 0%, #3B82F6 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 32px rgba(37, 99, 235, 0.3)',
                }}>
                  <RobotOutlined style={{ fontSize: 32, color: '#fff' }} />
                </div>

                {/* Welcome Text */}
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <Text style={{ color: 'var(--color-foreground)', fontSize: 20, fontWeight: 500, display: 'block' }}>
                    有什么可以帮助你的？
                  </Text>
                </div>
              </div>
            )}

          {/* Messages - Chat Style (only show when there are messages) */}
          {messages.length > 0 && messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: 16,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                marginBottom: 20,
                paddingTop: messages.indexOf(msg) === 0 ? 8 : 0,
              }}
            >
              {/* Avatar */}
              <Avatar
                size={36}
                icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                style={{
                  background: msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-muted)',
                  color: msg.role === 'user' ? '#fff' : 'var(--color-accent)',
                  flexShrink: 0,
                  border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)',
                }}
              />

              {/* Content */}
              <div style={{ maxWidth: '75%', minWidth: 0 }}>
                {/* Name & Time */}
                <div style={{
                  marginBottom: 6,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  <Text strong style={{ fontSize: 13, color: 'var(--color-foreground)' }}>
                    {msg.role === 'user'
                      ? (typeof window !== 'undefined' ? sessionStorage.getItem('username') || '我' : '我')
                      : '知识库助手'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {dayjs(msg.timestamp).format('HH:mm')}
                  </Text>
                </div>

                {/* Message Bubble */}
                <div style={{
                  padding: '14px 18px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, var(--color-accent) 0%, #3B82F6 100%)'
                    : 'var(--color-surface)',
                  color: msg.role === 'user' ? '#fff' : 'var(--color-foreground)',
                  borderRadius: msg.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                  lineHeight: 1.8,
                  fontSize: 14,
                  boxShadow: msg.role === 'user' ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.05)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)',
                }}>
                  <pre style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                    margin: 0,
                    fontSize: 'inherit',
                    lineHeight: 'inherit',
                  }}>
                    {msg.content}
                  </pre>
                </div>

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Collapse
                      ghost
                      size="small"
                      style={{ background: 'transparent' }}
                      items={[{
                        key: '1',
                        label: (
                          <Space size={8}>
                            <BookOutlined style={{ fontSize: 13, color: 'var(--color-accent)' }} />
                            <Text style={{ fontSize: 13, color: 'var(--color-foreground)', fontWeight: 500 }}>
                              {msg.citations.length} 篇引用来源
                            </Text>
                            {msg.traceId && (
                              <Tag color="default" style={{ fontSize: 10, marginLeft: 4 }}>
                                {msg.traceId.slice(0, 8)}
                              </Tag>
                            )}
                          </Space>
                        ),
                        children: (
                          <div style={{
                            background: 'var(--color-muted)',
                            borderRadius: 12,
                            padding: '4px 0',
                            marginTop: 4,
                          }}>
                            {msg.citations.map((cite, index) => (
                              <div
                                key={index}
                                style={{
                                  padding: '12px 16px',
                                  borderBottom: index < msg.citations!.length - 1 ? '1px solid var(--color-border)' : 'none',
                                }}
                              >
                                <Space size={6} style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                                  <Tag color="blue" style={{ borderRadius: 4, fontSize: 11 }}>#{index + 1}</Tag>
                                  <Text strong style={{ fontSize: 13 }}>{cite.title}</Text>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    v{cite.version} · 第{cite.page}页
                                  </Text>
                                  <Tag color="green" style={{ borderRadius: 4, fontSize: 10 }}>
                                    {(cite.score * 100).toFixed(0)}%
                                  </Tag>
                                  <Tooltip title="复制引用">
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<CopyOutlined style={{ fontSize: 11 }} />}
                                      onClick={() => copyToClipboard(cite.text)}
                                      style={{ marginLeft: 'auto' }}
                                    />
                                  </Tooltip>
                                </Space>
                                <Paragraph
                                  type="secondary"
                                  style={{
                                    margin: 0,
                                    fontSize: 12,
                                    padding: '8px 12px',
                                    background: 'var(--color-surface)',
                                    borderRadius: 6,
                                    borderLeft: '3px solid var(--color-accent)',
                                    lineHeight: 1.6,
                                  }}
                                >
                                  {cite.text}
                                </Paragraph>
                              </div>
                            ))}
                          </div>
                        ),
                      }]}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading */}
          {isLoading && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <Avatar icon={<RobotOutlined />} style={{ background: 'var(--color-muted)', color: 'var(--color-accent)', flexShrink: 0 }} />
              <div style={{
                padding: '14px 18px',
                background: 'var(--color-surface)',
                borderRadius: '4px 18px 18px 18px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                border: '1px solid var(--color-border)',
              }}>
                <Space size={12}>
                  <Spin size="small" />
                  <Text type="secondary" style={{ fontSize: 13 }}>正在检索知识库并生成答案...</Text>
                </Space>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: 16,
          flexShrink: 0,
        }}>
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            padding: '4px 4px 4px 16px',
            display: 'flex',
            alignItems: 'flex-end',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}>
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
              placeholder="输入你的问题..."
              autoSize={{ minRows: 1, maxRows: 6 }}
              style={{
                border: 'none',
                boxShadow: 'none',
                resize: 'none',
                fontSize: 14,
                padding: '8px 0',
              }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={isLoading}
              disabled={!input.trim()}
              style={{
                height: 36,
                width: 36,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </div>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={4}>
              <HistoryOutlined style={{ fontSize: 12, color: 'var(--color-secondary)' }} />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {messages.length > 0 ? `${Math.ceil(messages.length / 2)} 条对话` : '新对话'}
              </Text>
            </Space>
            <Space size={4}>
              <ThunderboltOutlined style={{ fontSize: 11, color: 'var(--color-accent)' }} />
              <Text type="secondary" style={{ fontSize: 11 }}>
                回答基于知识库文档
              </Text>
            </Space>
          </div>
        </div>
        </div>
      </div>
    </AppLayout>
  );
}

'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Card,
  Typography,
  Space,
  Input,
  Avatar,
  Spin,
  App,
  Tooltip,
  Divider,
  Select,
  Upload,
  Tag,
} from 'antd';
import {
  RobotOutlined,
  UserOutlined,
  SendOutlined,
  BookOutlined,
  CopyOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  CheckCircleFilled,
  MessageOutlined,
  AimOutlined,
  SmileOutlined,
  PaperClipOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ChatMessage } from '@/types';
import { ragChat, initUpload, uploadFile, verifyUpload } from '@/api/http-client';
import CommandBar from '@/components/LUI/CommandBar';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import type { LUIAction } from '@/types';
import { useLLMModels, LLM_PROVIDERS } from '@/hooks/useLLMModels';
import { Button, Badge } from '@/components/ui';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const DEV_TENANT_ID = 'dev-tenant-001';

const EXAMPLE_QUESTIONS = [
  {
    icon: '📋',
    q: 'Hermes Agent 的安装方式有哪几种？',
    tag: '操作指引',
  },
  {
    icon: '🔍',
    q: 'Claude Code 和 OpenClaw 有什么区别？',
    tag: '产品对比',
  },
  {
    icon: '⚙️',
    q: '如何配置 MCP 工具连接？',
    tag: '配置指南',
  },
];

export default function RAGPage() {
  const { message } = App.useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // LLM 模型选择
  const { models, selectedModelId, setSelectedModelId } = useLLMModels();

  // 附件状态
  const [attachedFile, setAttachedFile] = useState<{ docId: string; fileName: string; fileSize: number } | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [username, setUsername] = useState('我');

  useEffect(() => {
    setUsername(sessionStorage.getItem('username') || '我');
  }, []);

  // 真实的文件上传
  const handleFileUpload = async (file: File) => {
    try {
      setIsUploadingFile(true);

      // 计算文件 hash
      const fileBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // 1. 初始化上传
      const initResp = await initUpload({
        tenantId: 'dev-tenant-001',
        filename: file.name,
        fileSize: file.size,
        fileHash: fileHash,
        docType: 'OTHER',
        bizDomain: 'COMPLIANCE',
        regionCode: 'CN-NATIONAL',
        secLevel: 1,
        effectiveFrom: dayjs().format('YYYY-MM-DD'),
        ownerUid: 'current-user',
        deptId: 'D01',
        knowledgeSpaceId: 'DEFAULT',
        chunkConfig: {
          useSpaceConfig: true,
          chunkSize: 512,
          overlapRatio: 10,
          chunkMode: 'SMART',
        },
        overwriteExisting: false,
      });

      // 2. 上传文件
      await uploadFile(initResp.docId, 1, file);

      // 3. 验证上传
      await verifyUpload(initResp.docId, 1);

      // 保存附件信息
      setAttachedFile({
        docId: initResp.docId,
        fileName: file.name,
        fileSize: file.size,
      });

      message.success(`文件「${file.name}」上传成功`);
    } catch (err: any) {
      message.error(`文件上传失败: ${err.message}`);
    } finally {
      setIsUploadingFile(false);
    }
  };

  // 移除附件
  const removeAttachment = () => {
    setAttachedFile(null);
  };

  const handleLUIAction = useCallback((action: LUIAction) => {
    if (action.type === 'NAVIGATE' && action.payload.path === '/rag') {
      message.success('已导航到知识问答');
    }
    if (action.type === 'CALL_SKILL') {
      message.success('已调用知识问答技能');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (queryText?: string) => {
    const text = queryText || input.trim();
    if (!text) return;

    if (!queryText) {
      setInput('');
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await ragChat({
        tenantId: DEV_TENANT_ID,
        query: text,
        sessionId,
        lang: 'zh',
      });

      if (response.sessionId) {
        setSessionId(response.sessionId);
      }

      const refusalMessages: Record<string, string> = {
        NO_MATCH: '知识库中暂时没有找到相关资料，请尝试调整问题或补充更多关键词。',
        NO_PERMISSION: '您没有权限查看相关内容，如有需要请联系管理员授权。',
        LOW_CONFIDENCE: '知识库中暂时没有找到相关资料，请尝试调整问题表述。',
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
        reason: response.reason,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '服务暂时不可用，请稍后再试或联系管理员。',
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

  const handleClearChat = () => {
    setMessages([]);
    setSessionId(undefined);
  };

  return (
    <AppLayout contentStyle={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <CommandBar onAction={handleLUIAction} />

      {/* Header */}
      <div style={{
        padding: '20px 40px 16px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0 as unknown as React.CSSProperties['flexShrink'],
        background: 'var(--color-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Brand Icon */}
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 50%, #60A5FA 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
            flexShrink: 0 as unknown as React.CSSProperties['flexShrink'],
          }}>
            <RobotOutlined style={{ fontSize: 20, color: '#fff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>
                知识智库
              </Text>
              <div style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.15)',
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 11,
                color: '#2563EB',
                fontWeight: 500,
              }}>
                AI 驱动
              </div>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              基于知识库文档，返回带引用的可信答案
            </Text>
          </div>
        </div>

        {/* Features */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {[
            { icon: <CheckCircleFilled style={{ color: '#15803D' }} />, label: '精准检索' },
            { icon: <BookOutlined style={{ color: '#1D4ED8' }} />, label: '多文档融合' },
            { icon: <FileTextOutlined style={{ color: '#7C3AED' }} />, label: '原文溯源' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <Text style={{ fontSize: 12, color: 'var(--color-secondary)', fontWeight: 500 }}>
                {item.label}
              </Text>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Body */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Centered Content */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 840,
          margin: '0 auto',
          width: '100%',
          padding: '0 40px',
          minHeight: 0,
          overflow: 'hidden',
        }}>
          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 24,
          }} role="log">

            {/* Empty State */}
            {messages.length === 0 && !isLoading && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingBottom: 40,
                gap: 32,
              }}>
                {/* Brand Visual */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: 22,
                    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 12px 40px rgba(37, 99, 235, 0.35)',
                    margin: '0 auto 20px',
                  }}>
                    <RobotOutlined style={{ fontSize: 36, color: '#fff' }} />
                  </div>
                  <Text style={{
                    display: 'block',
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'var(--color-foreground)',
                    letterSpacing: '-0.02em',
                    marginBottom: 8,
                  }}>
                    有什么可以帮助你的？
                  </Text>
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    基于知识库文档，AI 智能分析并返回可信答案
                  </Text>
                </div>

                {/* Example Questions */}
                <div style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  maxWidth: 560,
                }}>
                  <Text style={{ fontSize: 12, color: 'var(--color-secondary)', textAlign: 'center', marginBottom: 4 }}>
                    试试这样问
                  </Text>
                  {EXAMPLE_QUESTIONS.map((item, i) => (
                    <div
                      key={i}
                      onClick={() => handleSend(item.q)}
                      className="hover-card"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 20px',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                      <Text style={{ flex: 1, fontSize: 14, color: 'var(--color-foreground)', lineHeight: 1.5 }}>
                        {item.q}
                      </Text>
                      <Badge variant="outline" size="sm">
                        {item.tag}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const showCitations = !isUser && msg.citations && msg.citations.length > 0;

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexDirection: isUser ? 'row-reverse' : 'row',
                    marginBottom: 24,
                  }}
                >
                  {/* Avatar */}
                  <Avatar
                    size={36}
                    icon={isUser ? <UserOutlined /> : <RobotOutlined />}
                    style={{
                      background: isUser
                        ? 'linear-gradient(135deg, #1E40AF, #3B82F6)'
                        : 'var(--color-muted)',
                      color: isUser ? '#fff' : 'var(--color-accent)',
                      flexShrink: 0 as unknown as React.CSSProperties['flexShrink'],
                      fontSize: 16,
                    }}
                  />

                  {/* Content Column */}
                  <div style={{ maxWidth: '76%', minWidth: 0 }}>
                    {/* Meta row */}
                    <div style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 6,
                      flexDirection: isUser ? 'row-reverse' : 'row',
                    }}>
                      <Text strong style={{ fontSize: 13, color: 'var(--color-foreground)' }}>
                        {isUser ? username : '知识智库'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {dayjs(msg.timestamp).format('HH:mm')}
                      </Text>
                    </div>

                    {/* Message Bubble */}
                    <div style={{
                      padding: '14px 18px',
                      background: isUser
                        ? 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)'
                        : 'var(--color-surface)',
                      color: isUser ? '#fff' : 'var(--color-foreground)',
                      borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      lineHeight: 1.8,
                      fontSize: 14,
                      boxShadow: isUser ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
                      border: isUser ? 'none' : '1px solid var(--color-border)',
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
                    {showCitations && !msg.reason && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 10,
                        }}>
                          <BookOutlined style={{ fontSize: 13, color: 'var(--color-accent)' }} />
                          <Text style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-foreground)' }}>
                            参考文档
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            共 {msg.citations!.length} 篇
                          </Text>
                        </div>

                        <div style={{
                          background: 'var(--color-muted)',
                          borderRadius: 14,
                          padding: '4px 12px 12px',
                          border: '1px solid var(--color-border)',
                        }}>
                          {msg.citations!.map((cite, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                marginTop: idx === 0 ? 8 : 0,
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                marginBottom: idx < msg.citations!.length - 1 ? 8 : 0,
                              }}
                            >
                              {/* Doc header */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 8,
                                flexWrap: 'wrap',
                                gap: 6,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <FileTextOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />
                                  <Text strong style={{ fontSize: 13, color: 'var(--color-foreground)' }}>
                                    {cite.title || '无标题文档'}
                                  </Text>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <Badge variant={cite.score > 0.85 ? 'success' : cite.score > 0.7 ? 'warning' : 'destructive'} size="sm">
                                    {cite.score > 0.85 ? '高匹配' : cite.score > 0.7 ? '中匹配' : '低匹配'}
                                  </Badge>
                                  <Tooltip title="复制原文">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      icon={<CopyOutlined style={{ fontSize: 11 }} />}
                                      onClick={() => copyToClipboard(cite.text)}
                                      style={{ color: 'var(--color-secondary)' }}
                                    />
                                  </Tooltip>
                                </div>
                              </div>

                              {/* Doc meta */}
                              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  v{cite.version}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>·</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  第 {cite.page} 页
                                </Text>
                                {cite.chunkSeq !== undefined && (
                                  <>
                                    <Text type="secondary" style={{ fontSize: 11 }}>·</Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      切片 #{cite.chunkSeq + 1}
                                    </Text>
                                  </>
                                )}
                                <Text type="secondary" style={{ fontSize: 11 }}>·</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  相似度 {(cite.score * 100).toFixed(0)}%
                                </Text>
                              </div>

                              {/* Quote */}
                              <Paragraph
                                style={{
                                  margin: 0,
                                  fontSize: 12,
                                  color: 'var(--color-secondary)',
                                  padding: '8px 10px',
                                  background: 'var(--color-muted)',
                                  borderRadius: 6,
                                  borderLeft: '3px solid var(--color-accent)',
                                  lineHeight: 1.7,
                                  lineClamp: 3,
                                }}
                                ellipsis={{ rows: 3 }}
                              >
                                {cite.text}
                              </Paragraph>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error or Refusal */}
                    {msg.reason && !isUser && (
                      <div style={{
                        marginTop: 10,
                        padding: '10px 14px',
                        background: msg.reason === 'NO_PERMISSION'
                          ? 'rgba(185, 28, 28, 0.06)'
                          : 'rgba(217, 119, 6, 0.06)',
                        border: `1px solid ${msg.reason === 'NO_PERMISSION' ? 'rgba(185,28,28,0.2)' : 'rgba(217,119,6,0.2)'}`,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        <MessageOutlined style={{
                          fontSize: 14,
                          color: msg.reason === 'NO_PERMISSION' ? '#B91C1C' : '#B45309',
                        }} />
                        <Text style={{
                          fontSize: 12,
                          color: msg.reason === 'NO_PERMISSION' ? '#B91C1C' : '#B45309',
                        }}>
                          {msg.content}
                        </Text>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading */}
            {isLoading && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <Avatar icon={<RobotOutlined />} style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-accent)',
                  flexShrink: 0 as unknown as React.CSSProperties['flexShrink'],
                  fontSize: 16,
                }} />
                <div style={{
                  padding: '14px 18px',
                  background: 'var(--color-surface)',
                  borderRadius: '4px 16px 16px 16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: '1px solid var(--color-border)',
                  maxWidth: 300,
                }}>
                  <Space size={12}>
                    <Spin size="small" />
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      正在检索知识库...
                    </Text>
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
            paddingBottom: 24,
            flexShrink: 0 as unknown as React.CSSProperties['flexShrink'],
          }}>
            {/* 现代化输入框容器 */}
            <div
              className="focus-ring"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 24,
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                transition: 'all var(--transition-base)',
              }}
            >
              {/* 顶部工具栏：模型选择 + 技能标签 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px 0',
                borderBottom: '1px solid var(--color-border)',
                marginBottom: 8,
              }}>
                {/* 模型选择器 */}
                <Select
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                  style={{ width: 160 }}
                  size="small"
                  dropdownMatchSelectWidth={200}
                  bordered={false}
                  suffixIcon={<RobotOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />}
                >
                  {models.map(model => {
                    const provider = LLM_PROVIDERS.find(p => p.value === model.provider);
                    return (
                      <Select.Option key={model.id} value={model.id}>
                        <Space size={6}>
                          <span>{provider?.icon || '🤖'}</span>
                          <span style={{ fontSize: 12 }}>{model.modelName}</span>
                        </Space>
                      </Select.Option>
                    );
                  })}
                </Select>

                <div style={{ flex: 1 }} />

                {/* 技能选择标签（未来扩展预留） */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  background: 'rgba(37,99,235,0.06)',
                  borderRadius: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(37,99,235,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(37,99,235,0.06)';
                  }}
                >
                  <ThunderboltOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 500 }}>选择技能</span>
                </div>
              </div>

              {/* 文本输入区域 */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                padding: '0 16px 12px',
                gap: 8,
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
                  placeholder="输入你的问题，AI 将基于知识库回答..."
                  autoSize={{ minRows: 1, maxRows: 6 }}
                  style={{
                    border: 'none',
                    boxShadow: 'none',
                    resize: 'none',
                    fontSize: 14,
                    padding: '8px 0',
                    lineHeight: 1.7,
                    background: 'transparent',
                  }}
                />
              </div>

              {/* 底部工具栏：附件 + 发送 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px 12px',
                borderTop: '1px solid var(--color-border)',
                background: 'var(--color-muted)',
              }}>
                {/* 左侧工具 */}
                <Space size={8}>
                  {/* 附件已上传，显示为标签 */}
                  {attachedFile ? (
                    <Badge
                      variant="default"
                      icon={<FileTextOutlined style={{ fontSize: 12 }} />}
                      className="animate-fade-in"
                    >
                      <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {attachedFile.fileName}
                      </span>
                      <button
                        onClick={removeAttachment}
                        style={{
                          marginLeft: 6,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-muted-foreground)',
                          fontSize: 12,
                          padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </Badge>
                  ) : (
                    <Upload
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        handleFileUpload(file);
                        return false;
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={isUploadingFile ? <LoadingOutlined /> : <PaperClipOutlined />}
                        disabled={isUploadingFile}
                        style={{
                          color: 'var(--color-secondary)',
                          height: 28,
                          borderRadius: 8,
                        }}
                      >
                        {isUploadingFile ? '上传中...' : '附件'}
                      </Button>
                    </Upload>
                  )}
                </Space>

                {/* 右侧发送按钮 */}
                <Button
                  variant="primary"
                  size="md"
                  icon={<SendOutlined />}
                  onClick={() => handleSend()}
                  loading={isLoading}
                  disabled={!input.trim() && !attachedFile}
                >
                  发送
                </Button>
              </div>
            </div>

            {/* Footer hints */}
            <div style={{
              marginTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}>
              <Space size={4}>
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<MessageOutlined style={{ fontSize: 11 }} />}
                    onClick={handleClearChat}
                    style={{ fontSize: 11, height: 22, padding: '0 4px' }}
                  >
                    清除对话
                  </Button>
                )}
                {messages.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {Math.ceil(messages.length / 2)} 条对话
                  </Text>
                )}
              </Space>

              <Space size={4}>
                <AimOutlined style={{ fontSize: 11, color: 'var(--color-accent)' }} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  回答基于知识库文档，支持原文溯源
                </Text>
              </Space>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

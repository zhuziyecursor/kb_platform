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
  TreeSelect,
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
  FolderOutlined,
  LikeOutlined,
  LikeFilled,
  StarOutlined,
  StarFilled,
} from '@ant-design/icons';
import type { ChatMessage, KnowledgeSpaceTreeNode } from '@/types';
import {
  ragChat,
  initUpload,
  uploadFile,
  verifyUpload,
  listSessions,
  createSession,
  getSessionMessages,
} from '@/api/http-client';
import type { RagSessionSummary, RagMessageItem } from '@/api/http-client';
import { getSpaceTree } from '@/api/knowledge-space';
import CommandBar from '@/components/LUI/CommandBar';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import RagSessionPanel from '@/components/RagSessionPanel';
import type { LUIAction } from '@/types';
import { Button, Badge } from '@/components/ui';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const DEV_TENANT_ID = 'dev-tenant-001';
const DEV_USER_ID = 'current-user';

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

function buildSpaceTreeNodes(spaces: KnowledgeSpaceTreeNode[]): any[] {
  return spaces
    .filter((s) => s.smartParseEnabled)
    .map((s) => ({
      value: s.id,
      title: s.name,
      children: s.children && s.children.length > 0 ? buildSpaceTreeNodes(s.children) : undefined,
    }));
}

export default function RAGPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessionRefresh, setSessionRefresh] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 附件状态
  const [attachedFile, setAttachedFile] = useState<{ docId: string; fileName: string; fileSize: number } | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [username, setUsername] = useState('我');

  // 检索范围
  const [spaceTree, setSpaceTree] = useState<KnowledgeSpaceTreeNode[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | undefined>();
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    setUsername(sessionStorage.getItem('username') || '我');
    getSpaceTree().then(setSpaceTree).catch(() => {});
  }, []);

  // 加载会话消息
  const loadSessionMessages = useCallback(async (sid: string) => {
    try {
      const msgs = await getSessionMessages(sid, DEV_TENANT_ID);
      const mapped: ChatMessage[] = [];
      for (const m of msgs) {
        const parsedCitations = m.citations ? parseCitations(m.citations) : undefined;
        mapped.push({
          id: `msg-${m.id}`,
          role: m.role,
          content: m.content,
          citations: parsedCitations,
          traceId: m.traceId || undefined,
          timestamp: m.createdAt,
        });
      }
      setMessages(mapped);
    } catch {
      message.error('加载会话消息失败');
    }
  }, []);

  const parseCitations = (raw: string): any[] => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleSelectSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    await loadSessionMessages(sid);
  }, [loadSessionMessages]);

  const handleNewSession = useCallback((sid: string) => {
    setSessionId(sid);
    setMessages([]);
  }, []);

  // 真实的文件上传
  const handleFileUpload = async (file: File) => {
    try {
      setIsUploadingFile(true);

      const fileBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

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

      await uploadFile(initResp.docId, 1, file);
      await verifyUpload(initResp.docId, 1);

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

    let currentSessionId = sessionId;

    if (!currentSessionId) {
      try {
        const res = await createSession(DEV_TENANT_ID, DEV_USER_ID);
        currentSessionId = res.sessionId;
        setSessionId(currentSessionId);
        setSessionRefresh((n) => n + 1);
      } catch {
        message.error('创建会话失败');
        return;
      }
    }

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
        sessionId: currentSessionId,
        lang: 'zh',
        spaceId: selectedSpaceId,
      });

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
          spacePath: c.spacePath || '',
        })),
        traceId: response.traceId,
        timestamp: Date.now(),
        reason: response.reason,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setSessionRefresh((n) => n + 1);
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
  }, [input, sessionId, selectedSpaceId]);

  const handleLike = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, liked: !m.liked } : m))
    );
  }, []);

  const handleFavorite = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, favorited: !m.favorited } : m))
    );
    const target = messages.find((m) => m.id === msgId);
    if (target) {
      message.success(target.favorited ? '已取消收藏' : '已收藏');
    }
  }, [messages, message]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    });
  };

  const navigateToDoc = (docId: string) => {
    router.push(`/documents/${docId}`);
  };

  const handleClearChat = () => {
    setMessages([]);
    setSessionId(undefined);
  };

  const spaceTreeOptions = buildSpaceTreeNodes(spaceTree);

  return (
    <AppLayout contentStyle={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <CommandBar onAction={handleLUIAction} />

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header__brand">
          <div className="chat-header__icon">
            <RobotOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="chat-header__title">知识智库</span>
              <span className="chat-header__badge">AI 驱动</span>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              基于知识库文档，返回带引用的可信答案
            </Text>
          </div>
        </div>

        <div className="chat-header__features">
          {[
            { icon: <CheckCircleFilled style={{ color: '#15803D' }} />, label: '精准检索' },
            { icon: <BookOutlined style={{ color: '#1D4ED8' }} />, label: '多文档融合' },
            { icon: <FileTextOutlined style={{ color: '#7C3AED' }} />, label: '原文溯源' },
          ].map((item, i) => (
            <div key={i} className="chat-header__feature-item">
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span className="chat-header__feature-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Body with Session Panel + Chat */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Session Panel */}
        <RagSessionPanel
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          refreshTrigger={sessionRefresh}
        />

        {/* Chat Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
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
                <div className="chat-empty">
                  <div style={{ textAlign: 'center' }}>
                    <div className="chat-empty__icon">
                      <RobotOutlined style={{ fontSize: 28, color: '#fff' }} />
                    </div>
                    <span className="chat-empty__title">
                      有什么可以帮助你的？
                    </span>
                    <p className="chat-empty__subtitle">
                      基于知识库文档，AI 智能分析并返回可信答案
                    </p>
                  </div>

                  <div className="chat-empty__examples">
                    <p className="chat-empty__examples-label">
                      试试这样问
                    </p>
                    {EXAMPLE_QUESTIONS.map((item, i) => (
                      <div
                        key={i}
                        onClick={() => handleSend(item.q)}
                        className="chat-example-card"
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
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const showCitations = !isUser && msg.citations && msg.citations.length > 0;

                return (
                  <div
                    key={msg.id}
                    className={cn('chat-message', isUser && 'chat-message--user')}
                    style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}
                  >
                    <Avatar
                      size={40}
                      icon={isUser ? <UserOutlined /> : <RobotOutlined />}
                      className={cn(
                        'chat-message__avatar',
                        isUser ? 'chat-message__avatar--user' : 'chat-message__avatar--assistant'
                      )}
                    />

                    <div className="chat-message__content">
                      <div className={cn('chat-message__meta', isUser && 'chat-message__meta--user')}>
                        <span className="chat-message__author">{isUser ? username : '知识智库'}</span>
                        <span className="chat-message__time">{dayjs(msg.timestamp).format('HH:mm')}</span>
                      </div>

                      <div className={cn(
                        'chat-message__bubble',
                        isUser ? 'chat-message__bubble--user' : 'chat-message__bubble--assistant'
                      )}>
                        <pre className="chat-message__text">{msg.content}</pre>
                      </div>

                      {/* Message Actions */}
                      {!isUser && !msg.reason && (
                        <div className="chat-message__actions">
                          <Tooltip title="复制全文">
                            <button
                              className="chat-message__action-btn"
                              onClick={() => copyToClipboard(msg.content)}
                            >
                              <CopyOutlined style={{ fontSize: 14 }} />
                            </button>
                          </Tooltip>
                          <Tooltip title={msg.liked ? '取消点赞' : '点赞'}>
                            <button
                              className={cn('chat-message__action-btn', msg.liked && 'chat-message__action-btn--active-like')}
                              onClick={() => handleLike(msg.id)}
                            >
                              {msg.liked
                                ? <LikeFilled style={{ fontSize: 14 }} />
                                : <LikeOutlined style={{ fontSize: 14 }} />}
                            </button>
                          </Tooltip>
                          <Tooltip title={msg.favorited ? '取消收藏' : '收藏'}>
                            <button
                              className={cn('chat-message__action-btn', msg.favorited && 'chat-message__action-btn--active-fav')}
                              onClick={() => handleFavorite(msg.id)}
                            >
                              {msg.favorited
                                ? <StarFilled style={{ fontSize: 14 }} />
                                : <StarOutlined style={{ fontSize: 14 }} />}
                            </button>
                          </Tooltip>
                        </div>
                      )}

                      {/* Citations */}
                      {showCitations && !msg.reason && (
                        <div className="chat-citations">
                          <div className="chat-citations__header">
                            <BookOutlined className="chat-citations__icon" />
                            <span className="chat-citations__title">参考文档</span>
                            <span className="chat-citations__count">共 {msg.citations!.length} 篇</span>
                          </div>

                          <div className="chat-citations__container">
                            {msg.citations!.map((cite, idx) => (
                              <div
                                key={idx}
                                onClick={() => navigateToDoc(cite.docId)}
                                className="chat-citation-card"
                              >
                                {/* Doc header */}
                                <div className="chat-citation-card__header">
                                  <div className="chat-citation-card__doc-info">
                                    <FileTextOutlined className="chat-citation-card__doc-icon" />
                                    {/* Space path */}
                                    {cite.spacePath && (
                                      <span className="chat-citation-card__space-path">
                                        <FolderOutlined style={{ marginRight: 4 }} />
                                        {cite.spacePath}
                                      </span>
                                    )}
                                    <Text strong className="chat-citation-card__doc-title" ellipsis>
                                      {cite.title || '无标题文档'}
                                    </Text>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <Badge variant={cite.score > 0.85 ? 'success' : cite.score > 0.7 ? 'warning' : 'destructive'} size="sm">
                                      {cite.score > 0.85 ? '高匹配' : cite.score > 0.7 ? '中匹配' : '低匹配'}
                                    </Badge>
                                    <Tooltip title="复制原文">
                                      <button
                                        className="chat-message__action-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(cite.text);
                                        }}
                                      >
                                        <CopyOutlined style={{ fontSize: 12 }} />
                                      </button>
                                    </Tooltip>
                                  </div>
                                </div>

                                {/* Doc meta */}
                                <div className="chat-citation-card__meta">
                                  <span className="chat-citation-card__meta-item">v{cite.version}</span>
                                  <span className="chat-citation-card__meta-divider">·</span>
                                  <span className="chat-citation-card__meta-item">第 {cite.page} 页</span>
                                  {cite.chunkSeq !== undefined && (
                                    <>
                                      <span className="chat-citation-card__meta-divider">·</span>
                                      <span className="chat-citation-card__meta-item">第 {cite.chunkSeq + 1} 段</span>
                                    </>
                                  )}
                                  <span className="chat-citation-card__meta-divider">·</span>
                                  <span className="chat-citation-card__meta-item">相似度 {(cite.score * 100).toFixed(0)}%</span>
                                  <span className="chat-citation-card__meta-item" style={{ color: 'var(--color-accent)' }}>· 点击查看文档</span>
                                </div>

                                {/* Quote */}
                                <Paragraph
                                  className="chat-citation-card__quote"
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
                        <div className={cn('chat-status', msg.reason === 'NO_PERMISSION' ? 'chat-status--error' : 'chat-status--warning')}>
                          <MessageOutlined className={cn('chat-status__icon', msg.reason === 'NO_PERMISSION' ? 'chat-status__icon--error' : 'chat-status__icon--warning')} />
                          <span className={cn('chat-status__text', msg.reason === 'NO_PERMISSION' ? 'chat-status__text--error' : 'chat-status__text--warning')}>
                            {msg.content}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Loading */}
              {isLoading && (
                <div className="chat-loading">
                  <div className="chat-loading__avatar">
                    <RobotOutlined />
                  </div>
                  <div className="chat-loading__bubble">
                    <div className="chat-loading__dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="chat-loading__text">正在检索知识库...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="chat-input-area">
              <div
                className={cn('chat-input__wrapper', 'focus-ring', isInputFocused && 'chat-input__wrapper--focused')}
              >
                {/* 顶部工具栏：检索范围 + 模型选择 */}
                <div className="chat-input__toolbar">
                  {/* 检索范围选择器 */}
                  <TreeSelect
                    value={selectedSpaceId}
                    onChange={setSelectedSpaceId}
                    placeholder="全部知识库"
                    allowClear
                    treeData={spaceTreeOptions}
                    style={{ width: 180 }}
                    size="small"
                    bordered={false}
                    treeDefaultExpandAll
                    suffixIcon={<FolderOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />}
                    dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                  />

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
                <div style={{ display: 'flex', alignItems: 'flex-end', padding: '0 16px 12px', gap: 8 }}>
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
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
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
                <div className="chat-input__footer">
                  <Space size={8}>
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
              <div className="chat-input__hints">
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
                    <span className="chat-input__hint-text">
                      {Math.ceil(messages.length / 2)} 条对话
                    </span>
                  )}
                  {selectedSpaceId && (
                    <span className="chat-input__hint-text" style={{ color: 'var(--color-accent)' }}>
                      已限定检索范围
                    </span>
                  )}
                </Space>

                <Space size={4}>
                  <AimOutlined style={{ fontSize: 11, color: 'var(--color-accent)' }} />
                  <span className="chat-input__hint-text">
                    回答基于知识库文档，支持原文溯源
                  </span>
                </Space>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

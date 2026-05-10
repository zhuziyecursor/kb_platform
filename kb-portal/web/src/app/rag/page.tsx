'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Typography,
  Space,
  Input,
  Avatar,
  App,
  Tooltip,
  TreeSelect,
  Upload,
  Modal,
  Alert,
  Drawer,
  Progress,
  Tag,
  Popover,
  Divider,
  Empty,
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
  PaperClipOutlined,
  LoadingOutlined,
  FolderOutlined,
  LikeOutlined,
  LikeFilled,
  StarOutlined,
  StarFilled,
  ProfileOutlined,
  CloseOutlined,
  InboxOutlined,
  CloseCircleOutlined,
  AppstoreOutlined,
  FormOutlined,
  FileSearchOutlined,
  SafetyOutlined,
  LineChartOutlined,
  CloudServerOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import type { ChatMessage, KnowledgeSpaceTreeNode, Skill } from '@/types';
import {
  ragChat,
  initUpload,
  uploadFile,
  verifyUpload,
  commitDoc,
  ingestDoc,
  getDocStatus,
  createSession,
  getSessionMessages,
  getPipelineTrace,
} from '@/api/http-client';
import type { RagPipelineTraceResponse } from '@/api/http-client';
import { getSpaceTree } from '@/api/knowledge-space';
import CommandBar from '@/components/LUI/CommandBar';
import AppLayout from '@/components/AppLayout';
import RagSessionPanel from '@/components/RagSessionPanel';
import AnswerRenderer from '@/components/AnswerRenderer';
import type { LUIAction } from '@/types';
import { Button, Badge } from '@/components/ui';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import { useExtensions, type ExternalSkill, type PromptConfig, type CustomSkill } from '@/hooks/useExtensions';

const { Text } = Typography;
const { TextArea } = Input;

const DEV_TENANT_ID = 'dev-tenant-001';
const DEV_USER_ID = 'current-user';
const QUICK_INGEST_SKILL_ID = 'skill-quick-ingest';
const QUICK_INGEST_SKILL_NAME = '智能入库';

// 内置技能定义（与 CommandBar 保持一致）
const BUILT_IN_SKILLS: Skill[] = [
  { id: 'skill-quick-ingest', name: '智能入库', description: '选择智能分析知识空间，上传文件并自动触发解析入库流水线', icon: '📥', category: 'upload' },
  { id: 'skill-upload', name: '文档上传', description: '打开文档上传界面，选择文件并配置元数据', icon: '📤', category: 'upload' },
  { id: 'skill-reparse', name: '重新解析', description: '对指定文档重新执行解析、清洗、切片流程', icon: '🔄', category: 'document' },
  { id: 'skill-doc-status', name: '查询文档状态', description: '查看文档当前的处理进度和状态', icon: '📋', category: 'document' },
  { id: 'skill-rag-query', name: '知识问答', description: '在知识库中检索相关文档并生成带引用的答案', icon: '🤖', category: 'rag' },
  { id: 'skill-doc-cleanup', name: '文档清理', description: '清理失败或过期的文档记录', icon: '🧹', category: 'system' },
];



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

function findSpaceNodeById(spaces: KnowledgeSpaceTreeNode[], id?: string): KnowledgeSpaceTreeNode | undefined {
  if (!id) return undefined;
  for (const space of spaces) {
    if (space.id === id) return space;
    const child = findSpaceNodeById(space.children || [], id);
    if (child) return child;
  }
  return undefined;
}

function getPreferredSmartSpaceId(spaces: KnowledgeSpaceTreeNode[], currentSpaceId?: string): string | undefined {
  const current = findSpaceNodeById(spaces, currentSpaceId);
  if (current?.smartParseEnabled) return current.id;
  for (const space of spaces) {
    if (space.smartParseEnabled) return space.id;
    const child = getPreferredSmartSpaceId(space.children || []);
    if (child) return child;
  }
  return undefined;
}

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  cache_lookup: '缓存检查',
  session_context: '会话上下文',
  query_rewrite: '查询改写',
  embedding: '查询向量化',
  milvus_search: 'Milvus 召回',
  acl_post_filter: 'ACL 预过滤',
  space_filter: '知识空间过滤',
  rerank: '精排',
  acl_verify: 'ACL 二次校验',
  parent_lookup: 'Parent 回捞',
  refusal_check: '拒答判断',
  prompt_build: 'Prompt 构造',
  llm_generate: 'LLM 生成',
  llm_generate_stream: 'LLM 流式生成',
  session_create: '创建会话',
  session_save: '保存会话',
  cache_write: '写入缓存',
};

function formatStageName(stage: string): string {
  return PIPELINE_STAGE_LABELS[stage] || stage;
}

async function computeFileHash(file: File): Promise<string> {
  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function RAGPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
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
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [quickIngestOpen, setQuickIngestOpen] = useState(false);
  const [quickIngestSpaceId, setQuickIngestSpaceId] = useState<string | undefined>();
  const [quickIngestFile, setQuickIngestFile] = useState<File | null>(null);
  const [quickIngestLoading, setQuickIngestLoading] = useState(false);
  const [quickIngestPhase, setQuickIngestPhase] = useState<'idle' | 'uploading' | 'processing' | 'ready' | 'failed'>('idle');
  const [quickIngestStatusText, setQuickIngestStatusText] = useState('请选择知识空间和文件');
  const [quickIngestDocId, setQuickIngestDocId] = useState<string | null>(null);
  const [traceDrawerOpen, setTraceDrawerOpen] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<RagPipelineTraceResponse | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  // 技能选择状态
  const [selectedSkill, setSelectedSkill] = useState<Skill | ExternalSkill | PromptConfig | CustomSkill | null>(null);
  const [skillPopoverOpen, setSkillPopoverOpen] = useState(false);

  // 扩展管理数据
  const { externalSkills, customSkills, prompts } = useExtensions();

  // 启用的扩展技能列表
  const enabledExternalSkills = useMemo(() => externalSkills.filter(s => s.enabled), [externalSkills]);
  const enabledCustomSkills = useMemo(() => customSkills.filter(s => s.enabled), [customSkills]);
  const enabledPrompts = useMemo(() => prompts.filter(p => p.enabled), [prompts]);
  const hasAnySkills = enabledExternalSkills.length > 0 || enabledCustomSkills.length > 0 || enabledPrompts.length > 0;

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

      const fileHash = await computeFileHash(file);

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

  const openQuickIngest = useCallback(() => {
    setQuickIngestSpaceId(getPreferredSmartSpaceId(spaceTree, selectedSpaceId));
    setQuickIngestFile(null);
    setQuickIngestPhase('idle');
    setQuickIngestStatusText('请选择开启智能分析的知识空间，并上传文件');
    setQuickIngestDocId(null);
    setQuickIngestOpen(true);
  }, [selectedSpaceId, spaceTree]);

  const pollQuickIngestStatus = async (docId: string, version: number) => {
    for (let i = 0; i < 40; i += 1) {
      const status = await getDocStatus(docId, version);
      if (status.status === 'READY') {
        setQuickIngestPhase('ready');
        setQuickIngestStatusText('流水线处理完成，文档已可用于知识问答');
        return;
      }
      if (status.status === 'FAILED') {
        setQuickIngestPhase('failed');
        setQuickIngestStatusText(status.lastError || '流水线处理失败，请稍后重试');
        return;
      }
      setQuickIngestStatusText(
        status.status === 'PENDING'
          ? '文件已提交，等待流水线处理...'
          : '正在解析、切片并写入向量库...'
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    setQuickIngestPhase('processing');
    setQuickIngestStatusText('文件已进入流水线，可稍后在文档列表查看处理结果');
  };

  const handleQuickIngestSubmit = async () => {
    if (!quickIngestSpaceId) {
      message.warning('请选择开启智能分析的知识空间');
      return;
    }
    if (!quickIngestFile) {
      message.warning('请选择要入库的文件');
      return;
    }

    const selectedSpace = findSpaceNodeById(spaceTree, quickIngestSpaceId);
    if (!selectedSpace?.smartParseEnabled) {
      message.warning('该知识空间未开启智能分析，请重新选择');
      return;
    }

    try {
      setQuickIngestLoading(true);
      setQuickIngestPhase('uploading');
      setQuickIngestStatusText('正在计算文件指纹...');

      const fileHash = await computeFileHash(quickIngestFile);
      const version = 1;

      setQuickIngestStatusText('正在创建上传任务...');
      const initResp = await initUpload({
        tenantId: DEV_TENANT_ID,
        filename: quickIngestFile.name,
        fileSize: quickIngestFile.size,
        fileHash,
        docType: 'OTHER',
        bizDomain: 'COMPLIANCE',
        regionCode: 'CN-NATIONAL',
        secLevel: 1,
        effectiveFrom: dayjs().format('YYYY-MM-DD'),
        ownerUid: DEV_USER_ID,
        deptId: 'D01',
        knowledgeSpaceId: quickIngestSpaceId,
        labelTags: 'quick-ingest',
        chunkConfig: {
          useSpaceConfig: true,
          chunkSize: selectedSpace.chunkSize || 512,
          overlapRatio: selectedSpace.overlapRatio || 10,
          chunkMode: selectedSpace.chunkMode || 'SMART',
        },
        overwriteExisting: false,
      });

      setQuickIngestDocId(initResp.docId);
      setQuickIngestStatusText('正在上传文件...');
      await uploadFile(initResp.docId, version, quickIngestFile);

      setQuickIngestStatusText('正在校验上传结果...');
      await verifyUpload(initResp.docId, version);

      setQuickIngestStatusText('正在提交文档并触发流水线...');
      const commitResp = await commitDoc(initResp.docId, version, {
        tenantId: DEV_TENANT_ID,
        sha256: fileHash,
        acl: [{
          accessorType: 'USER',
          accessorId: DEV_USER_ID,
          permission: 'WRITE',
        }],
      });

      if (commitResp.status === 'PENDING') {
        await ingestDoc(initResp.docId, version);
      }

      setQuickIngestPhase('processing');
      setQuickIngestStatusText('文件已上传，流水线正在处理...');
      message.success('文件已提交智能入库');
      await pollQuickIngestStatus(initResp.docId, version);
    } catch (err: any) {
      setQuickIngestPhase('failed');
      setQuickIngestStatusText(err?.message || '智能入库失败，请稍后重试');
      message.error(`智能入库失败: ${err?.message || '未知错误'}`);
    } finally {
      setQuickIngestLoading(false);
    }
  };

  const handleLUIAction = useCallback((action: LUIAction) => {
    if (action.type === 'NAVIGATE' && action.payload.path === '/rag') {
      message.success('已导航到知识问答');
    }
    if (action.type === 'CALL_SKILL') {
      const skill = action.payload.skill as { id?: string; name?: string } | undefined;
      if (action.payload.skillId === QUICK_INGEST_SKILL_ID || skill?.name === QUICK_INGEST_SKILL_NAME) {
        openQuickIngest();
        return;
      }
      message.success('已调用知识问答技能');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [message, openQuickIngest]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 构建带技能上下文的查询
  const buildQueryWithSkill = useCallback((text: string, skill: typeof selectedSkill): string => {
    if (!skill) return text;

    let skillContext = '';
    if ('content' in skill && skill.content) {
      // PromptConfig - 注入提示词内容作为系统上下文
      skillContext = `[系统提示: ${skill.name}]
${skill.content}

---

${text}`;
    } else if ('description' in skill && skill.description) {
      // ExternalSkill / CustomSkill / Skill
      skillContext = `[使用技能: ${skill.name}]
${skill.description}

---

${text}`;
    } else {
      skillContext = `[使用技能: ${skill.name}]\n\n${text}`;
    }

    return skillContext;
  }, []);

  const handleSend = useCallback(async (queryText?: string) => {
    const text = queryText || input.trim();
    if (!text) return;
    if (text === `/${QUICK_INGEST_SKILL_NAME}` || text === '/quick-ingest') {
      if (!queryText) setInput('');
      openQuickIngest();
      return;
    }

    // 处理选中技能的快捷触发
    if (selectedSkill) {
      const skillName = selectedSkill.name;
      if (skillName === QUICK_INGEST_SKILL_NAME) {
        openQuickIngest();
        setSelectedSkill(null);
        if (!queryText) setInput('');
        return;
      }
    }

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

    // 注入技能上下文到查询中
    const queryWithSkill = buildQueryWithSkill(text, selectedSkill);

    try {
      const response = await ragChat({
        tenantId: DEV_TENANT_ID,
        query: queryWithSkill,
        sessionId: currentSessionId,
        lang: 'zh',
        spaceId: selectedSpaceId,
      });

      // 发送成功后清除选中的技能
      if (selectedSkill) {
        setSelectedSkill(null);
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
  }, [input, sessionId, selectedSpaceId, openQuickIngest, selectedSkill, buildQueryWithSkill]);

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

  const openTraceDrawer = async (traceId: string) => {
    setSelectedTraceId(traceId);
    setSelectedTrace(null);
    setTraceDrawerOpen(true);
    setTraceLoading(true);
    try {
      const trace = await getPipelineTrace(traceId);
      setSelectedTrace(trace);
    } catch {
      message.error('链路详情暂不可用，请确认后端已应用可观测性迁移');
    } finally {
      setTraceLoading(false);
    }
  };

  const handleFollowUpClick = (question: string) => {
    setInput(question);
    handleSend(question);
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
    <AppLayout contentStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0, maxWidth: 'none' }}>
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
          <Button
            variant={isContextOpen ? 'primary' : 'outline'}
            size="sm"
            icon={<ProfileOutlined />}
            onClick={() => setIsContextOpen((open) => !open)}
            aria-expanded={isContextOpen}
          >
            当前上下文
          </Button>
        </div>
      </div>

      {/* Body with Session Panel + Chat */}
      <div className="chat-body">
        {/* Session Panel */}
        <RagSessionPanel
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          refreshTrigger={sessionRefresh}
        />

        {/* Chat Area */}
        <div className="chat-main">
          <div className="chat-center">
            {/* Messages Area */}
            <div className="chat-messages-scroll" role="log">

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
                const isLastAssistant = !isUser && isStreaming && idx === messages.length - 1;

                return (
                  <div
                    key={msg.id}
                    className={cn('chat-message-row', isUser ? 'chat-message-row--user' : 'chat-message-row--assistant')}
                    style={{ animationDelay: `${Math.min(idx * 40, 300)}ms` }}
                  >
                    {!isUser && (
                      <Avatar size={36} icon={<RobotOutlined />} className="chat-avatar chat-avatar--assistant" />
                    )}

                    <div className="chat-content">
                      <div className={cn('chat-content-header', isUser && 'chat-content-header--user')}>
                        <span className="chat-author">{isUser ? username : '知识智库'}</span>
                        <span className="chat-time">{dayjs(msg.timestamp).format('HH:mm')}</span>
                        {!isUser && msg.traceId && (
                          <button
                            className="chat-trace-link"
                            onClick={() => openTraceDrawer(msg.traceId!)}
                          >
                            <ProfileOutlined />
                            链路详情
                          </button>
                        )}
                      </div>

                      {isUser ? (
                        <div className="chat-bubble-user">{msg.content}</div>
                      ) : (
                        <>
                          {msg.reason ? (
                            <div className="chat-bubble-assistant">
                              {msg.content}
                            </div>
                          ) : (
                            <div className="chat-bubble-assistant">
                              <AnswerRenderer
                                content={msg.content}
                                onFollowUpClick={handleFollowUpClick}
                              />
                              {isLastAssistant && <span className="chat-typing-cursor" />}
                            </div>
                          )}

                          {/* Message Actions */}
                          <div className="chat-actions">
                            {!msg.reason && (
                              <>
                              <Tooltip title="复制全文">
                                <button className="chat-action-btn" onClick={() => copyToClipboard(msg.content)}>
                                  <CopyOutlined style={{ fontSize: 13 }} />
                                </button>
                              </Tooltip>
                              <Tooltip title={msg.liked ? '取消点赞' : '点赞'}>
                                <button
                                  className={cn('chat-action-btn', msg.liked && 'chat-action-btn--active-like')}
                                  onClick={() => handleLike(msg.id)}
                                >
                                  {msg.liked ? <LikeFilled style={{ fontSize: 13 }} /> : <LikeOutlined style={{ fontSize: 13 }} />}
                                </button>
                              </Tooltip>
                              <Tooltip title={msg.favorited ? '取消收藏' : '收藏'}>
                                <button
                                  className={cn('chat-action-btn', msg.favorited && 'chat-action-btn--active-fav')}
                                  onClick={() => handleFavorite(msg.id)}
                                >
                                  {msg.favorited ? <StarFilled style={{ fontSize: 13 }} /> : <StarOutlined style={{ fontSize: 13 }} />}
                                </button>
                              </Tooltip>
                              </>
                            )}
                          </div>

                          {/* Sources / Citations */}
                          {msg.citations && msg.citations.length > 0 && !msg.reason && (
                            <div className="chat-sources">
                              <button className="chat-sources-toggle">
                                <BookOutlined style={{ fontSize: 12 }} />
                                <span>参考文档 ({msg.citations.length})</span>
                              </button>
                              <div className="chat-sources-list">
                                {msg.citations.map((cite, cidx) => (
                                  <div key={cidx} className="chat-source-item" onClick={() => navigateToDoc(cite.docId)}>
                                    <div className="chat-source-header">
                                      <FileTextOutlined style={{ fontSize: 14, color: 'var(--color-accent)', flexShrink: 0 }} />
                                      <span className="chat-source-title">{cite.title || '无标题文档'}</span>
                                    </div>
                                    <div className="chat-source-meta">
                                      <span className={cn('chat-source-tag', cite.score > 0.85 ? 'chat-source-tag--high' : cite.score > 0.7 ? 'chat-source-tag--medium' : 'chat-source-tag--low')}>
                                        {cite.score > 0.85 ? '高匹配' : cite.score > 0.7 ? '中匹配' : '低匹配'}
                                      </span>
                                      <span className="chat-source-tag">v{cite.version}</span>
                                      <span className="chat-source-tag">第{cite.page}页</span>
                                    </div>
                                    <p className="chat-source-quote">{cite.text}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Refusal */}
                          {msg.reason && (
                            <div className={cn('chat-status', msg.reason === 'NO_PERMISSION' ? 'chat-status--error' : 'chat-status--warning')}>
                              <MessageOutlined />
                              <span>{msg.content}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {isUser && (
                      <Avatar size={36} icon={<UserOutlined />} className="chat-avatar chat-avatar--user" />
                    )}
                  </div>
                );
              })}

              {/* Loading */}
              {isLoading && !isStreaming && (
                <div className="chat-loading-row">
                  <div className="chat-loading-avatar"><RobotOutlined /></div>
                  <div className="chat-loading-content">
                    <div className="chat-loading-dots"><span /><span /><span /></div>
                    <span className="chat-loading-text">正在检索知识库...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="chat-input-area">
              <div className={cn('chat-input-box', 'focus-ring', isInputFocused && 'chat-input-box--focused', selectedSkill && 'chat-input-box--skilled')}>
                <div className="chat-input-toolbar">
                  {/* 检索范围选择器 */}
                  <TreeSelect
                    value={selectedSpaceId}
                    onChange={setSelectedSpaceId}
                    placeholder="全部知识库"
                    allowClear
                    treeData={spaceTreeOptions}
                    style={{ width: 180 }}
                    size="small"
                    variant="borderless"
                    treeDefaultExpandAll
                    suffixIcon={<FolderOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />}
                    styles={{ popup: { root: { maxHeight: 400, overflow: 'auto' } } }}
                  />

                  <div style={{ flex: 1 }} />

                  {/* 技能选择器 */}
                  {selectedSkill ? (
                    <Tooltip title={`已选择: ${selectedSkill.name}，点击清除`}>
                      <Tag
                        color="blue"
                        closable
                        onClose={() => setSelectedSkill(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 10px',
                          borderRadius: 16,
                          fontSize: 12,
                          fontWeight: 500,
                          margin: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <ThunderboltOutlined style={{ fontSize: 11 }} />
                        {'icon' in selectedSkill && selectedSkill.icon ? (
                          <span style={{ fontSize: 12 }}>{selectedSkill.icon}</span>
                        ) : null}
                        <span>{selectedSkill.name}</span>
                      </Tag>
                    </Tooltip>
                  ) : (
                    <Popover
                      open={skillPopoverOpen}
                      onOpenChange={setSkillPopoverOpen}
                      trigger="click"
                      placement="bottomRight"
                      arrow={false}
                      content={(
                        <div style={{ width: 340, maxHeight: 480, overflow: 'auto' }}>
                          {/* 内置技能 */}
                          <div style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                              <AppstoreOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />
                              <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>内置技能</Text>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {BUILT_IN_SKILLS.map((skill) => (
                                <div
                                  key={skill.id}
                                  onClick={() => {
                                    setSelectedSkill(skill);
                                    setSkillPopoverOpen(false);
                                    if (skill.name === QUICK_INGEST_SKILL_NAME) {
                                      openQuickIngest();
                                      setSelectedSkill(null);
                                    } else {
                                      message.success(`已选择技能: ${skill.name}`);
                                      inputRef.current?.focus();
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(37,99,235,0.06)';
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                                  }}
                                >
                                  <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{skill.icon}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)', lineHeight: 1.4 }}>{skill.name}</div>
                                    <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)', lineHeight: 1.4, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</div>
                                  </div>
                                  <Tag style={{ fontSize: 10, flexShrink: 0, lineHeight: '18px', height: 20, padding: '0 6px' }}>{skill.category}</Tag>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 外部技能 */}
                          {enabledExternalSkills.length > 0 && (
                            <>
                              <Divider style={{ margin: '4px 0' }} />
                              <div style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                  <CloudServerOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />
                                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>外部技能</Text>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {enabledExternalSkills.map((skill) => (
                                    <div
                                      key={skill.id}
                                      onClick={() => {
                                        setSelectedSkill(skill);
                                        setSkillPopoverOpen(false);
                                        message.success(`已选择外部技能: ${skill.name}`);
                                        inputRef.current?.focus();
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '8px 10px',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(37,99,235,0.06)';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                                      }}
                                    >
                                      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{skill.icon || '🔧'}</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)', lineHeight: 1.4 }}>{skill.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)', lineHeight: 1.4, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</div>
                                      </div>
                                      {skill.category && <Tag style={{ fontSize: 10, flexShrink: 0, lineHeight: '18px', height: 20, padding: '0 6px' }}>{skill.category}</Tag>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          {/* 自定义技能 */}
                          {enabledCustomSkills.length > 0 && (
                            <>
                              <Divider style={{ margin: '4px 0' }} />
                              <div style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                  <ApiOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />
                                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>自定义技能</Text>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {enabledCustomSkills.map((skill) => (
                                    <div
                                      key={skill.id}
                                      onClick={() => {
                                        setSelectedSkill(skill);
                                        setSkillPopoverOpen(false);
                                        message.success(`已选择自定义技能: ${skill.name}`);
                                        inputRef.current?.focus();
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '8px 10px',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(37,99,235,0.06)';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                                      }}
                                    >
                                      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚙️</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)', lineHeight: 1.4 }}>{skill.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)', lineHeight: 1.4, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</div>
                                      </div>
                                      <Tag style={{ fontSize: 10, flexShrink: 0, lineHeight: '18px', height: 20, padding: '0 6px' }}>{skill.type}</Tag>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          {/* 提示词模板 */}
                          {enabledPrompts.length > 0 && (
                            <>
                              <Divider style={{ margin: '4px 0' }} />
                              <div style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                  <FormOutlined style={{ fontSize: 12, color: 'var(--color-accent)' }} />
                                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>提示词模板</Text>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {enabledPrompts.map((prompt) => (
                                    <div
                                      key={prompt.id}
                                      onClick={() => {
                                        setSelectedSkill(prompt);
                                        setSkillPopoverOpen(false);
                                        message.success(`已选择提示词: ${prompt.name}`);
                                        inputRef.current?.focus();
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '8px 10px',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                      }}
                                      onMouseEnter={(e) => {
                                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(37,99,235,0.06)';
                                      }}
                                      onMouseLeave={(e) => {
                                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                                      }}
                                    >
                                      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{prompt.icon || '📝'}</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)', lineHeight: 1.4 }}>{prompt.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)', lineHeight: 1.4, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prompt.description}</div>
                                      </div>
                                      {prompt.category && <Tag style={{ fontSize: 10, flexShrink: 0, lineHeight: '18px', height: 20, padding: '0 6px' }}>{prompt.category}</Tag>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          {!hasAnySkills && (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description={
                                <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                                  暂无可用扩展技能<br />
                                  前往<Button variant="ghost" size="xs" onClick={() => router.push('/extensions')} style={{ fontSize: 12, padding: '0 4px', height: 'auto' }}>扩展管理</Button>配置
                                </div>
                              }
                              style={{ padding: '20px 0' }}
                            />
                          )}
                        </div>
                      )}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 12px',
                        background: 'rgba(37,99,235,0.06)',
                        borderRadius: 16,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: skillPopoverOpen ? '1px solid rgba(37,99,235,0.25)' : '1px solid transparent',
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
                    </Popover>
                  )}
                </div>

                <div className="chat-input-body">
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
                    placeholder={selectedSkill ? `[${selectedSkill.name}] 输入你的问题...` : '输入你的问题，或输入 /智能入库 快速上传解析文件...'}
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

                <div className="chat-input-footer">
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
                        <Tooltip title={isUploadingFile ? '上传中' : '添加附件'}>
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
                            aria-label={isUploadingFile ? '上传中' : '添加附件'}
                          />
                        </Tooltip>
                      </Upload>
                    )}
                  </Space>

                  <Button
                    variant="primary"
                    size="md"
                    icon={<SendOutlined />}
                    onClick={() => handleSend()}
                    loading={isLoading || isStreaming}
                    disabled={(!input.trim() && !attachedFile) || isLoading || isStreaming}
                  >
                    {isStreaming ? '生成中...' : '发送'}
                  </Button>
                </div>
              </div>

              <div className="chat-input-hints">
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
                    <span className="chat-input-hint-text">
                      {Math.ceil(messages.length / 2)} 条对话
                    </span>
                  )}
                  {selectedSpaceId && (
                    <span className="chat-input-hint-text" style={{ color: 'var(--color-accent)' }}>
                      已限定检索范围
                    </span>
                  )}
                </Space>

                <Space size={4}>
                  <AimOutlined style={{ fontSize: 11, color: 'var(--color-accent)' }} />
                  <span className="chat-input-hint-text">
                    回答基于知识库文档，支持原文溯源
                  </span>
                </Space>
              </div>
            </div>
          </div>
        </div>

        <aside className={cn('chat-context-panel', isContextOpen && 'chat-context-panel--open')}>
          <div className="chat-context-panel__header">
            <div>
              <div className="chat-context-panel__title">当前对话上下文</div>
              <div className="chat-context-panel__meta">
                {messages.length > 0 ? `${messages.length} 条消息` : '暂无消息'}
              </div>
            </div>
            <Tooltip title="关闭">
              <button
                className="chat-context-panel__close"
                onClick={() => setIsContextOpen(false)}
                aria-label="关闭当前对话上下文"
              >
                <CloseOutlined />
              </button>
            </Tooltip>
          </div>
          <div className="chat-context-panel__scroll">
            {messages.length === 0 ? (
              <div className="chat-context-empty">
                <ProfileOutlined />
                <span>发送问题后，这里会展示当前会话的上下文摘要。</span>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={`context-${msg.id}`} className="chat-context-item">
                  <div className="chat-context-item__head">
                    <span className={cn('chat-context-item__role', msg.role === 'user' ? 'chat-context-item__role--user' : 'chat-context-item__role--assistant')}>
                      {msg.role === 'user' ? '用户' : '回答'}
                    </span>
                    <span className="chat-context-item__time">
                      {dayjs(msg.timestamp).format('HH:mm')}
                    </span>
                  </div>
                  <p className="chat-context-item__text">{msg.content}</p>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="chat-context-item__refs">
                      <BookOutlined />
                      <span>{msg.citations.length} 个引用来源</span>
                    </div>
                  )}
                  {index < messages.length - 1 && <div className="chat-context-item__line" />}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      <Drawer
        title="RAG 链路详情"
        open={traceDrawerOpen}
        onClose={() => setTraceDrawerOpen(false)}
        width={520}
      >
        <div className="pipeline-trace-drawer">
          {traceLoading ? (
            <div className="pipeline-trace-loading">
              <LoadingOutlined />
              <span>正在加载链路详情...</span>
            </div>
          ) : selectedTrace ? (
            <>
              <div className="pipeline-trace-summary">
                <div>
                  <Text type="secondary">Trace ID</Text>
                  <div className="pipeline-trace-id">
                    <Text code copyable>{selectedTrace.traceId}</Text>
                  </div>
                </div>
                <Tag color={selectedTrace.result === 'SUCCESS' ? 'success' : selectedTrace.result === 'ERROR' ? 'error' : 'processing'}>
                  {selectedTrace.result}
                </Tag>
              </div>

              <div className="pipeline-trace-metrics">
                <div className="pipeline-trace-metric">
                  <span>{selectedTrace.totalMs}</span>
                  <label>总耗时 ms</label>
                </div>
                <div className="pipeline-trace-metric">
                  <span>{selectedTrace.recallCount}</span>
                  <label>召回</label>
                </div>
                <div className="pipeline-trace-metric">
                  <span>{selectedTrace.rerankCount}</span>
                  <label>精排</label>
                </div>
                <div className="pipeline-trace-metric">
                  <span>{selectedTrace.citationsCount}</span>
                  <label>引用</label>
                </div>
                {selectedTrace.promptBudget?.estimatedPromptTokens != null && (
                  <div className="pipeline-trace-metric">
                    <span>{selectedTrace.promptBudget.estimatedPromptTokens}</span>
                    <label>Prompt Tokens</label>
                  </div>
                )}
              </div>

              <div className="pipeline-trace-flags">
                <Tag color={selectedTrace.cacheHit ? 'green' : 'default'}>
                  {selectedTrace.cacheHit ? '缓存命中' : '未命中缓存'}
                </Tag>
                {selectedTrace.firstTokenMs != null && (
                  <Tag color="blue">首 Token {selectedTrace.firstTokenMs}ms</Tag>
                )}
                {selectedTrace.refusalReason && (
                  <Tag color="orange">{selectedTrace.refusalReason}</Tag>
                )}
                {selectedTrace.promptBudget?.enabled != null && (
                  <Tag color={selectedTrace.promptBudget.enabled ? 'purple' : 'default'}>
                    {selectedTrace.promptBudget.enabled ? '预算控制开启' : '预算控制关闭'}
                  </Tag>
                )}
              </div>

              {selectedTrace.rewrittenQuery && selectedTrace.rewrittenQuery !== selectedTrace.queryText && (
                <div className="pipeline-trace-block">
                  <Text type="secondary">改写后查询</Text>
                  <p>{selectedTrace.rewrittenQuery}</p>
                </div>
              )}

              {selectedTrace.promptBudget && Object.keys(selectedTrace.promptBudget).length > 0 && (
                <div className="pipeline-trace-block">
                  <Text type="secondary">Prompt 预算</Text>
                  <div className="pipeline-budget-grid">
                    <span>输入预算 {selectedTrace.promptBudget.inputBudgetTokens ?? '-'}</span>
                    <span>预估 Prompt {selectedTrace.promptBudget.estimatedPromptTokens ?? '-'}</span>
                    <span>保留引用 {selectedTrace.promptBudget.includedCitations ?? '-'}</span>
                    <span>丢弃引用 {selectedTrace.promptBudget.droppedCitations ?? '-'}</span>
                    <span>压缩引用 {selectedTrace.promptBudget.truncatedCitations ?? '-'}</span>
                    <span>保留历史 {selectedTrace.promptBudget.includedHistoryTurns ?? '-'}</span>
                    <span>丢弃历史 {selectedTrace.promptBudget.droppedHistoryTurns ?? '-'}</span>
                  </div>
                </div>
              )}

              <div className="pipeline-trace-section-title">阶段耗时</div>
              <div className="pipeline-stage-list">
                {selectedTrace.stageTimings.map((stage, index) => {
                  const percent = selectedTrace.totalMs > 0
                    ? Math.min(100, Math.round((stage.durationMs / selectedTrace.totalMs) * 100))
                    : 0;
                  return (
                    <div key={`${stage.stage}-${index}`} className="pipeline-stage-item">
                      <div className="pipeline-stage-item__head">
                        <span>{formatStageName(stage.stage)}</span>
                        <span className={stage.status === 'ERROR' ? 'pipeline-stage-item__time--error' : ''}>
                          {stage.durationMs}ms
                        </span>
                      </div>
                      <Progress
                        percent={percent}
                        showInfo={false}
                        size="small"
                        status={stage.status === 'ERROR' ? 'exception' : 'normal'}
                      />
                      {stage.errorMessage && (
                        <div className="pipeline-stage-item__error">{stage.errorMessage}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {selectedTrace.hitDocs.length > 0 && (
                <>
                  <div className="pipeline-trace-section-title">命中文档</div>
                  <div className="pipeline-hit-docs">
                    {selectedTrace.hitDocs.map((doc, index) => (
                      <div key={`${doc.docId}-${index}`} className="pipeline-hit-doc">
                        <FileTextOutlined />
                        <div>
                          <div className="pipeline-hit-doc__title">{doc.title || doc.docId || '未命名文档'}</div>
                          <div className="pipeline-hit-doc__meta">
                            {doc.score != null && <span>score {Number(doc.score).toFixed(3)}</span>}
                            {doc.version != null && <span>v{doc.version}</span>}
                            {doc.page != null && <span>第{doc.page}页</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {selectedTrace.errorMessage && (
                <Alert type="error" showIcon message="链路异常" description={selectedTrace.errorMessage} />
              )}
            </>
          ) : (
            <Alert
              type="warning"
              showIcon
              message="未找到链路记录"
              description={selectedTraceId ? `traceId: ${selectedTraceId}` : undefined}
            />
          )}
        </div>
      </Drawer>

      <Modal
        title="智能入库"
        open={quickIngestOpen}
        onCancel={() => !quickIngestLoading && setQuickIngestOpen(false)}
        footer={
          <Space>
            <Button
              variant="ghost"
              onClick={() => setQuickIngestOpen(false)}
              disabled={quickIngestLoading}
            >
              取消
            </Button>
            <Button
              variant="primary"
              icon={<InboxOutlined />}
              loading={quickIngestLoading}
              disabled={!quickIngestSpaceId || !quickIngestFile || quickIngestLoading || quickIngestPhase === 'ready'}
              onClick={handleQuickIngestSubmit}
            >
              上传并解析
            </Button>
          </Space>
        }
        width={620}
        destroyOnClose={false}
        maskClosable={!quickIngestLoading}
      >
        <div className="quick-ingest-modal">
          <Alert
            type={quickIngestPhase === 'failed' ? 'error' : quickIngestPhase === 'ready' ? 'success' : 'info'}
            showIcon
            message={quickIngestStatusText}
            description="该技能会把文件正式写入所选知识空间，并自动执行解析、清洗、切片和向量化流程。"
          />

          <div className="quick-ingest-field">
            <Text strong>知识空间</Text>
            <TreeSelect
              value={quickIngestSpaceId}
              onChange={setQuickIngestSpaceId}
              placeholder="请选择开启智能分析的知识空间"
              allowClear
              treeData={spaceTreeOptions}
              treeDefaultExpandAll
              disabled={quickIngestLoading}
              style={{ width: '100%', marginTop: 8 }}
              styles={{ popup: { root: { maxHeight: 360, overflow: 'auto' } } }}
            />
          </div>

          <div className="quick-ingest-field">
            <Text strong>上传文件</Text>
            <Upload.Dragger
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md"
              multiple={false}
              maxCount={1}
              disabled={quickIngestLoading}
              fileList={quickIngestFile ? [{
                uid: 'quick-ingest-file',
                name: quickIngestFile.name,
                size: quickIngestFile.size,
                status: 'done',
              }] as any : []}
              beforeUpload={(file) => {
                setQuickIngestFile(file);
                setQuickIngestPhase('idle');
                setQuickIngestStatusText('文件已选择，点击“上传并解析”开始入库');
                return false;
              }}
              onRemove={() => {
                setQuickIngestFile(null);
                setQuickIngestPhase('idle');
                setQuickIngestStatusText('请选择开启智能分析的知识空间，并上传文件');
              }}
              style={{ marginTop: 8 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">拖拽文件到这里，或点击选择文件</p>
              <p className="ant-upload-hint">支持 PDF、Word、PPT、Excel、TXT、Markdown。文件会进入知识库流水线。</p>
            </Upload.Dragger>
          </div>

          {quickIngestDocId && (
            <div className="quick-ingest-docid">
              <Text type="secondary">docId</Text>
              <Text code copyable>{quickIngestDocId}</Text>
            </div>
          )}
        </div>
      </Modal>
    </AppLayout>
  );
}

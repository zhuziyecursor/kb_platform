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
  Tag,
  Popover,
  Radio,
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
  InfoCircleFilled,
  ExclamationCircleFilled,
  MessageOutlined,
  AimOutlined,
  PaperClipOutlined,
  LoadingOutlined,
  FolderOutlined,
  LikeOutlined,
  LikeFilled,
  DislikeOutlined,
  DislikeFilled,
  StarOutlined,
  StarFilled,
  FlagOutlined,
  FlagFilled,
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
  EyeOutlined,
  AudioOutlined,
  AudioMutedOutlined,
} from '@ant-design/icons';
import type { ChatMessage, KnowledgeSpaceTreeNode, Skill, StageEvent } from '@/types';
import {
  ragChat,
  ragChatStream,
  initUpload,
  uploadFile,
  verifyUpload,
  commitDoc,
  ingestDoc,
  getDocStatus,
  createSession,
  getSessionMessages,
  getPipelineTrace,
  submitFeedback,
  getFeedback,
  getErrorMessage,
} from '@/api/http-client';
import type { RagPipelineTraceResponse } from '@/api/http-client';
import { getSpaceTree } from '@/api/knowledge-space';
import CommandBar from '@/components/LUI/CommandBar';
import AppLayout from '@/components/AppLayout';
import RagSessionPanel from '@/components/RagSessionPanel';
import AnswerRenderer from '@/components/AnswerRenderer';
import FilePreview from '@/components/FilePreview';
import ThinkingChainPanel from '@/components/ThinkingChainPanel';
import type { LUIAction } from '@/types';
import SlashCommandMenu, { SLASH_COMMANDS } from '@/components/SlashCommandMenu';
import type { SlashCommandContext } from '@/components/SlashCommandMenu';
import PipelineTraceView, { formatStageName } from '@/components/PipelineTraceView';
import { Button, Badge } from '@/components/ui';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import { useExtensions, type ExternalSkill, type PromptConfig, type CustomSkill } from '@/hooks/useExtensions';
import { useAgents, type ExpertAgent } from '@/hooks/useAgents';

const { Text } = Typography;
const { TextArea } = Input;

function getGeneratingStatus(stages: import('@/types').StageEvent[]): string {
  if (!stages || stages.length === 0) return '正在连接服务...';
  const last = stages[stages.length - 1].stage;
  switch (last) {
    case 'query_rewrite':
    case 'query_plan':
    case 'intent_route':
      return '正在理解问题...';
    case 'embedding':
      return '正在向量化查询...';
    case 'bm25_search':
    case 'milvus_search':
    case 'channel_executor':
    case 'hybrid_fusion':
    case 'rrf_fusion':
    case 'acl_post_filter':
    case 'clause_fast_path':
    case 'space_filter':
      return '正在检索知识库...';
    case 'rerank':
    case 'mmr_diversity':
      return '正在精排结果...';
    case 'acl_verify':
    case 'parent_lookup':
    case 'refusal_check':
    case 'prompt_build':
      return '正在整理上下文...';
    case 'llm_generate':
    case 'llm_generate_stream':
      return '正在生成回答...';
    default:
      return '正在处理...';
  }
}

const DEV_TENANT_ID = 'dev-tenant-001';
const DEV_USER_ID = 'current-user';
const QUICK_INGEST_SKILL_ID = 'skill-quick-ingest';
const QUICK_INGEST_SKILL_NAME = '智能入库';
const ACTIVE_AGENT_KEY = 'kb_active_expert_agent_id';

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
    q: '内部审计机构的主要任务和工作重点包括哪些？',
    tag: '内部审计',
  },
  {
    icon: '🔍',
    q: '安全生产法对生产经营单位主要负责人规定了哪些安全职责？',
    tag: '安全生产',
  },
  {
    icon: '⚖️',
    q: '民法典中关于合同无效的法定情形有哪些规定？',
    tag: '合同法规',
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
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 附件状态
  const [attachedFile, setAttachedFile] = useState<{ docId: string; fileName: string; fileSize: number } | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [username, setUsername] = useState('我');

  // 检索范围
  const [spaceTree, setSpaceTree] = useState<KnowledgeSpaceTreeNode[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | undefined>();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const voiceSupported = useRef(
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
  const recognitionRef = useRef<any>(null);
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
  const [activeAgent, setActiveAgent] = useState<ExpertAgent | null>(null);

  // 斜杠命令状态
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');

  // 引用原文预览状态
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string>('');
  const [previewVersion, setPreviewVersion] = useState<number>(1);
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [previewPage, setPreviewPage] = useState<number | undefined>(undefined);
  const [previewHighlight, setPreviewHighlight] = useState<string | undefined>(undefined);

  // 技能选择状态
  const [selectedSkill, setSelectedSkill] = useState<Skill | ExternalSkill | PromptConfig | CustomSkill | null>(null);
  const [skillPopoverOpen, setSkillPopoverOpen] = useState(false);

  // 反馈 Popover 状态
  const [feedbackPopoverMsgId, setFeedbackPopoverMsgId] = useState<string | null>(null);
  const [feedbackPopoverType, setFeedbackPopoverType] = useState<'DISLIKE' | 'REPORT' | null>(null);
  const [feedbackReason, setFeedbackReason] = useState<string>('OTHER');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  // 扩展管理数据
  const { externalSkills, customSkills, prompts } = useExtensions();
  const { agents, loaded: agentsLoaded } = useAgents();

  // 启用的扩展技能列表
  const enabledExternalSkills = useMemo(() => externalSkills.filter(s => s.enabled), [externalSkills]);
  const enabledCustomSkills = useMemo(() => customSkills.filter(s => s.enabled), [customSkills]);
  const enabledPrompts = useMemo(() => prompts.filter(p => p.enabled), [prompts]);
  const hasAnySkills = enabledExternalSkills.length > 0 || enabledCustomSkills.length > 0;

  useEffect(() => {
    setUsername(sessionStorage.getItem('username') || '我');
    getSpaceTree().then(setSpaceTree).catch(() => {});
  }, []);

  useEffect(() => {
    if (!agentsLoaded) return;
    const activeAgentId = sessionStorage.getItem(ACTIVE_AGENT_KEY);
    const nextAgent = activeAgentId ? agents.find((agent) => agent.id === activeAgentId) || null : null;
    setActiveAgent(nextAgent);
    if (nextAgent?.spaceIds?.length) {
      setSelectedSpaceId((current) => current || nextAgent.spaceIds[0]);
    }
  }, [agents, agentsLoaded]);

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

      // Restore thinking stages & feedback for historical assistant messages
      for (const m of mapped) {
        if (m.traceId && m.role === 'assistant') {
          try {
            const trace = await getPipelineTrace(m.traceId);
            if (trace?.stageTimings?.length) {
              let cumulative = 0;
              const stages = trace.stageTimings.map((t) => {
                cumulative += t.durationMs;
                return {
                  stage: t.stage,
                  status: (t.status === 'SUCCESS' ? 'SUCCESS' : t.status === 'ERROR' ? 'ERROR' : 'SKIPPED') as StageEvent['status'],
                  durationMs: t.durationMs,
                  elapsedMs: cumulative,
                  summary: t.metadata,
                };
              });
              setMessages((prev) =>
                prev.map((pm) =>
                  pm.id === m.id
                    ? { ...pm, thinkingStages: stages, thinkingDone: true }
                    : pm
                )
              );
            }
          } catch {
            // Trace fetch failure is non-critical
          }

          try {
            const fb = await getFeedback(m.traceId);
            if (fb) {
              setMessages((prev) =>
                prev.map((pm) =>
                  pm.id === m.id
                    ? { ...pm, feedbackType: fb.feedbackType as ChatMessage['feedbackType'], liked: fb.feedbackType === 'LIKE' }
                    : pm
                )
              );
            }
          } catch {
            // Feedback fetch failure is non-critical
          }
        }
      }
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
    } catch (err) {
      message.error(`文件上传失败: ${getErrorMessage(err)}`);
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
    } catch (err) {
      const detail = getErrorMessage(err, '智能入库失败，请稍后重试');
      setQuickIngestPhase('failed');
      setQuickIngestStatusText(detail);
      message.error(`智能入库失败: ${detail}`);
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

  const handleSend = useCallback(async (queryText?: string, opts?: { forceAssistant?: boolean }) => {
    const text = queryText || input.trim();
    if (!text) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    // 处理斜杠命令
    if (text.startsWith('/')) {
      const cmdName = text.slice(1).trim();
      const cmd = SLASH_COMMANDS.find((c) => c.name === cmdName);
      if (cmd) {
        const ctx: SlashCommandContext = {
          messages,
          setMessages,
          setInput,
          setSessionId,
          handleSend,
          setSessionRefresh,
        };
        sendingRef.current = false; // release lock so /summary can call handleSend internally
        cmd.execute(ctx);
        sendingRef.current = false;
        setSlashMenuOpen(false);
        setSlashFilter('');
        return;
      }
    }

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
    setIsStreaming(true);

    // 注入技能上下文到查询中
    const queryWithSkill = buildQueryWithSkill(text, selectedSkill);

    // Create assistant message placeholder
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      thinkingStages: [],
      thinkingDone: false,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      await ragChatStream(
        {
          tenantId: DEV_TENANT_ID,
          query: queryWithSkill,
          sessionId: currentSessionId,
          lang: 'zh',
          spaceId: selectedSpaceId || activeAgent?.spaceIds?.[0],
          systemPrompt: activeAgent?.systemPrompt,
          mode: (opts?.forceAssistant || activeAgent?.expertType === 'assistant') ? 'assistant' : 'rag',
        },
        // onToken
        (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + token, thinkingDone: true }
                : m
            )
          );
        },
        // onDone
        (result) => {
          const refusalMessages: Record<string, string> = {
            NO_MATCH: '当前知识库中未检索到与您的问题高度相关的内容。建议您换一种表述方式，或补充更具体的审计关键词后重试。',
            NO_PERMISSION: '您暂无权限访问该知识库的相关内容，请联系管理员开通对应空间的查阅权限。',
            LOW_CONFIDENCE: '当前匹配到的内容相关性较低，回答仅供参考。建议您调整问题表述或指定具体的审计业务场景。',
          };

          const displayContent = result.reason
            ? refusalMessages[result.reason] || result.answer
            : result.answer;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: displayContent,
                    citations: (result.citations || []).map((c) => ({
                      ...c,
                      sectionPath: c.sectionPath || '',
                      regionCode: c.regionCode || '',
                      effectiveFrom: c.effectiveFrom || '',
                      effectiveTo: c.effectiveTo,
                      spacePath: c.spacePath || '',
                    })),
                    traceId: result.traceId,
                    reason: result.reason,
                    messageId: result.messageId,
                    confidence: result.confidence,
                    intent: result.intent,
                    searchMode: result.searchMode,
                    channelStats: result.channelStats,
                    thinkingDone: true,
                  }
                : m
            )
          );
          setIsLoading(false);
          setIsStreaming(false);
          setSessionRefresh((n) => n + 1);
          sendingRef.current = false;

          // 发送成功后清除选中的技能
          if (selectedSkill) {
            setSelectedSkill(null);
          }
        },
        // onError
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: '服务暂时不可用，请稍后再试或联系管理员。',
                    thinkingDone: true,
                  }
                : m
            )
          );
          setIsLoading(false);
          setIsStreaming(false);
          sendingRef.current = false;
        },
        // onStage
        (stageEvent) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    thinkingStages: [...(m.thinkingStages || []), stageEvent],
                  }
                : m
            )
          );
        }
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: '服务暂时不可用，请稍后再试或联系管理员。',
                thinkingDone: true,
              }
            : m
        )
      );
      setIsLoading(false);
      setIsStreaming(false);
      sendingRef.current = false;
    }
  }, [activeAgent, input, sessionId, selectedSpaceId, openQuickIngest, selectedSkill, buildQueryWithSkill, messages]);

  const startVoiceInput = useCallback(() => {
    if (!voiceSupported.current) {
      message.warning('您的浏览器不支持语音输入，请使用 Chrome 或 Edge');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }
      if (finalTranscript) {
        setInput((prev) => prev + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        message.error('请授权麦克风权限后重试');
      } else if (event.error !== 'aborted') {
        message.error('语音识别出错，请重试');
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    message.info('正在聆听...');
  }, [message]);

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const handleLike = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.traceId) return;

    const isLiked = msg.feedbackType === 'LIKE';
    if (isLiked) {
      // Unlike: remove feedback state locally (backend keeps last state)
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, liked: false, feedbackType: undefined } : m))
      );
      return;
    }

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, liked: true, feedbackType: 'LIKE' } : m))
    );

    try {
      await submitFeedback({ traceId: msg.traceId, feedbackType: 'LIKE' });
    } catch {
      // Revert on failure
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, liked: false, feedbackType: undefined } : m))
      );
    }
  }, [messages]);

  const submitNegativeFeedback = useCallback(async () => {
    const msgId = feedbackPopoverMsgId;
    if (!msgId || !feedbackPopoverType) return;
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.traceId) return;

    setFeedbackSubmitting(true);
    try {
      await submitFeedback({
        traceId: msg.traceId,
        feedbackType: feedbackPopoverType,
        reportReason: feedbackReason as 'HALLUCINATION' | 'WRONG_CITATION' | 'IRRELEVANT' | 'OTHER',
        comment: feedbackComment || undefined,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, feedbackType: feedbackPopoverType } : m))
      );
      message.success('感谢反馈，我们会持续改进');
    } catch {
      message.error('提交失败，请稍后重试');
    } finally {
      setFeedbackSubmitting(false);
      setFeedbackPopoverMsgId(null);
      setFeedbackPopoverType(null);
      setFeedbackReason('OTHER');
      setFeedbackComment('');
    }
  }, [feedbackPopoverMsgId, feedbackPopoverType, feedbackReason, feedbackComment, messages, message]);

  const openFeedbackPopover = useCallback((msgId: string, type: 'DISLIKE' | 'REPORT') => {
    setFeedbackPopoverMsgId(msgId);
    setFeedbackPopoverType(type);
    setFeedbackReason('OTHER');
    setFeedbackComment('');
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

  const openSourcePreview = (cite: NonNullable<ChatMessage['citations']>[number]) => {
    setPreviewDocId(cite.docId);
    setPreviewVersion(cite.version);
    setPreviewFilename(cite.title || '文档预览');
    setPreviewPage(cite.page > 0 ? cite.page : undefined);
    setPreviewHighlight(cite.text || undefined);
    setPreviewOpen(true);
  };

  const handleClearChat = () => {
    setMessages([]);
    setSessionId(undefined);
  };

  const exitAgentMode = () => {
    sessionStorage.removeItem(ACTIVE_AGENT_KEY);
    setActiveAgent(null);
    setSelectedSpaceId(undefined);
    setMessages([]);
    setSessionId(undefined);
    message.success('已切换为普通知识问答');
  };

  const spaceTreeOptions = buildSpaceTreeNodes(spaceTree);

  return (
    <AppLayout contentStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0, maxWidth: 'none' }}>
      <CommandBar onAction={handleLUIAction} />

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header__brand">
          <div className="chat-header__icon">
            {activeAgent ? (
              <span style={{ fontSize: 18, lineHeight: 1 }}>{activeAgent.icon}</span>
            ) : (
              <RobotOutlined style={{ fontSize: 18, color: 'currentColor' }} />
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="chat-header__title">{activeAgent?.name || '知识智库'}</span>
              <span className="chat-header__badge">{activeAgent ? activeAgent.category : 'AI 驱动'}</span>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {activeAgent?.description || '基于知识库文档，返回带引用的可信答案'}
            </Text>
            {activeAgent?.expertType === 'assistant' && (
              <Tag color="purple" style={{ marginLeft: 8 }}>助手模式</Tag>
            )}
          </div>
        </div>

        <div className="chat-header__features">
          {(activeAgent?.expertType === 'assistant'
            ? [
                { icon: <CheckCircleFilled style={{ color: '#15803D' }} />, label: '智能对话' },
                { icon: <BookOutlined style={{ color: '#1D4ED8' }} />, label: '上下文理解' },
                { icon: <FileTextOutlined style={{ color: '#7C3AED' }} />, label: '即时响应' },
              ]
            : [
                { icon: <CheckCircleFilled style={{ color: '#15803D' }} />, label: '精准检索' },
                { icon: <BookOutlined style={{ color: '#1D4ED8' }} />, label: '多文档融合' },
                { icon: <FileTextOutlined style={{ color: '#7C3AED' }} />, label: '原文溯源' },
              ]
          ).map((item, i) => (
            <div key={i} className="chat-header__feature-item">
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span className="chat-header__feature-label">{item.label}</span>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/experts')}
          >
            返回广场
          </Button>
          {activeAgent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={exitAgentMode}
            >
              退出专家
            </Button>
          )}
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
                      <RobotOutlined style={{ fontSize: 28, color: 'currentColor' }} />
                    </div>
                    <span className="chat-empty__title">
                      {activeAgent?.expertType === 'assistant' ? '你好，我是你的智能助手' : '有什么可以帮助你的？'}
                    </span>
                    <p className="chat-empty__subtitle">
                      {activeAgent?.expertType === 'assistant'
                        ? '直接与大模型对话，回答各类问题'
                        : '基于知识库文档，AI 智能分析并返回可信答案'}
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
                      <Avatar size={36} icon={activeAgent ? <span>{activeAgent.icon}</span> : <RobotOutlined />} className="chat-avatar chat-avatar--assistant" />
                    )}

                    <div className="chat-content">
                      <div className={cn('chat-content-header', isUser && 'chat-content-header--user')}>
                        <span className="chat-author">{isUser ? username : activeAgent?.name || '知识智库'}</span>
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
                              {/* Generating indicator: visible while streaming and no content yet */}
                              {isLastAssistant && !msg.content && !msg.reason && (
                                <div className="chat-generating">
                                  <span className="chat-generating-dot" />
                                  <span>{getGeneratingStatus(msg.thinkingStages || [])}</span>
                                </div>
                              )}
                              {/* Thinking Chain Panel */}
                              {!msg.reason && msg.thinkingStages && msg.thinkingStages.length > 0 && (
                                <ThinkingChainPanel
                                  stages={msg.thinkingStages}
                                  streaming={isLastAssistant && !msg.thinkingDone}
                                  traceId={msg.traceId}
                                />
                              )}

                              {/* Confidence Bar — always visible when answer has citations */}
                              {msg.citations && msg.citations.length > 0 && (() => {
                                const scores = msg.citations.map(c => c.score);
                                const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                                const level: 'high' | 'medium' | 'low' = avg >= 0.8 ? 'high' : avg >= 0.5 ? 'medium' : 'low';
                                const label = level === 'high' ? '可信度高' : level === 'medium' ? '可信度中等' : '可信度偏低';
                                return (
                                  <div className={`chat-trust-bar chat-trust-bar--${level}`}>
                                    <span className="chat-trust-bar__dot" />
                                    <span className="chat-trust-bar__label">{label}</span>
                                    <span className="chat-trust-bar__meta">
                                      基于 <strong>{msg.citations.length}</strong> 条参考 · 平均相关度 <strong>{avg.toFixed(2)}</strong>
                                    </span>
                                  </div>
                                );
                              })()}
                              <AnswerRenderer
                                content={msg.content}
                                citations={msg.citations}
                                onFollowUpClick={handleFollowUpClick}
                                onCitationClick={(cidx) => {
                                  const cite = msg.citations?.[cidx];
                                  if (cite) openSourcePreview(cite);
                                }}
                              />
                              {isLastAssistant && <span className="chat-typing-cursor" />}
                            </div>
                          )}

                          {/* Search Mode & Intent Tags */}
                          {!msg.reason && (msg.searchMode || msg.intent || msg.channelStats) && (
                            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {msg.searchMode && (
                                <Tag
                                  color={msg.searchMode === 'HYBRID' ? 'purple' : msg.searchMode === 'BM25' ? 'blue' : msg.searchMode === 'FAQ' ? 'green' : msg.searchMode === 'CHITCHAT' ? 'orange' : 'default'}
                                  style={{ fontSize: 11, margin: 0 }}
                                >
                                  检索: {msg.searchMode}
                                </Tag>
                              )}
                              {msg.intent && (
                                <Tag
                                  color={msg.intent === 'POLICY_QA' ? 'blue' : msg.intent === 'DOC_SEARCH' ? 'cyan' : 'orange'}
                                  style={{ fontSize: 11, margin: 0 }}
                                >
                                  意图: {msg.intent}
                                </Tag>
                              )}
                              {msg.channelStats && Object.entries(msg.channelStats).filter(([, v]) => v > 0).length > 0 && (
                                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  通道命中: {Object.entries(msg.channelStats).filter(([, v]) => v > 0).map(([k, v]) => (
                                    <Tag key={k} color={k === 'DENSE' ? 'blue' : k === 'SPARSE' ? 'green' : k === 'STRUCTURED' ? 'orange' : k === 'FAQ' ? 'cyan' : 'default'} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>{k}:{v}</Tag>
                                  ))}
                                </span>
                              )}
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
                              <Tooltip title={msg.feedbackType === 'LIKE' ? '取消点赞' : '点赞'}>
                                <button
                                  className={cn('chat-action-btn', (msg.liked || msg.feedbackType === 'LIKE') && 'chat-action-btn--active-like')}
                                  onClick={() => handleLike(msg.id)}
                                >
                                  {(msg.liked || msg.feedbackType === 'LIKE') ? <LikeFilled style={{ fontSize: 13 }} /> : <LikeOutlined style={{ fontSize: 13 }} />}
                                </button>
                              </Tooltip>
                              <Popover
                                open={feedbackPopoverMsgId === msg.id && feedbackPopoverType === 'DISLIKE'}
                                onOpenChange={(open) => { if (!open) { setFeedbackPopoverMsgId(null); setFeedbackPopoverType(null); } }}
                                trigger="click"
                                placement="top"
                                content={
                                  <div style={{ width: 260 }}>
                                    <div style={{ marginBottom: 12, fontWeight: 500 }}>请选择不满意的原因</div>
                                    <Radio.Group
                                      value={feedbackReason}
                                      onChange={(e) => setFeedbackReason(e.target.value)}
                                      style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}
                                    >
                                      <Radio value="HALLUCINATION">幻觉 / 事实错误</Radio>
                                      <Radio value="WRONG_CITATION">引用来源不准确</Radio>
                                      <Radio value="IRRELEVANT">回答不相关</Radio>
                                      <Radio value="OTHER">其他</Radio>
                                    </Radio.Group>
                                    <Input.TextArea
                                      rows={2}
                                      placeholder="补充说明（可选）"
                                      value={feedbackComment}
                                      onChange={(e) => setFeedbackComment(e.target.value)}
                                      style={{ marginBottom: 12 }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                      <Button size="sm" onClick={() => { setFeedbackPopoverMsgId(null); setFeedbackPopoverType(null); }}>取消</Button>
                                      <Button size="sm" variant="primary" loading={feedbackSubmitting} onClick={submitNegativeFeedback}>提交</Button>
                                    </div>
                                  </div>
                                }
                              >
                                <Tooltip title={msg.feedbackType === 'DISLIKE' ? '已反馈' : '点踩'}>
                                  <button
                                    className={cn('chat-action-btn', msg.feedbackType === 'DISLIKE' && 'chat-action-btn--active-like')}
                                    onClick={() => openFeedbackPopover(msg.id, 'DISLIKE')}
                                  >
                                    {msg.feedbackType === 'DISLIKE' ? <DislikeFilled style={{ fontSize: 13 }} /> : <DislikeOutlined style={{ fontSize: 13 }} />}
                                  </button>
                                </Tooltip>
                              </Popover>
                              <Popover
                                open={feedbackPopoverMsgId === msg.id && feedbackPopoverType === 'REPORT'}
                                onOpenChange={(open) => { if (!open) { setFeedbackPopoverMsgId(null); setFeedbackPopoverType(null); } }}
                                trigger="click"
                                placement="top"
                                content={
                                  <div style={{ width: 260 }}>
                                    <div style={{ marginBottom: 12, fontWeight: 500 }}>请选择报错原因</div>
                                    <Radio.Group
                                      value={feedbackReason}
                                      onChange={(e) => setFeedbackReason(e.target.value)}
                                      style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}
                                    >
                                      <Radio value="HALLUCINATION">幻觉 / 事实错误</Radio>
                                      <Radio value="WRONG_CITATION">引用来源不准确</Radio>
                                      <Radio value="IRRELEVANT">回答不相关</Radio>
                                      <Radio value="OTHER">其他</Radio>
                                    </Radio.Group>
                                    <Input.TextArea
                                      rows={2}
                                      placeholder="补充说明（可选）"
                                      value={feedbackComment}
                                      onChange={(e) => setFeedbackComment(e.target.value)}
                                      style={{ marginBottom: 12 }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                      <Button size="sm" onClick={() => { setFeedbackPopoverMsgId(null); setFeedbackPopoverType(null); }}>取消</Button>
                                      <Button size="sm" variant="primary" loading={feedbackSubmitting} onClick={submitNegativeFeedback}>提交</Button>
                                    </div>
                                  </div>
                                }
                              >
                                <Tooltip title={msg.feedbackType === 'REPORT' ? '已报错' : '报错'}>
                                  <button
                                    className={cn('chat-action-btn', msg.feedbackType === 'REPORT' && 'chat-action-btn--active-like')}
                                    onClick={() => openFeedbackPopover(msg.id, 'REPORT')}
                                  >
                                    {msg.feedbackType === 'REPORT' ? <FlagFilled style={{ fontSize: 13 }} /> : <FlagOutlined style={{ fontSize: 13 }} />}
                                  </button>
                                </Tooltip>
                              </Popover>
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
                                {msg.citations.map((cite, cidx) => {
                                  const trustLevel = cite.score >= 0.8 ? 'high' : cite.score >= 0.5 ? 'medium' : 'low';
                                  const trustConfig = {
                                    high: { label: `高可信 ${cite.score.toFixed(2)}`, icon: <CheckCircleFilled style={{ fontSize: 11 }} />, className: 'chat-source-tag--trust-high' },
                                    medium: { label: `中可信 ${cite.score.toFixed(2)}`, icon: <InfoCircleFilled style={{ fontSize: 11 }} />, className: 'chat-source-tag--trust-medium' },
                                    low: { label: `低可信 ${cite.score.toFixed(2)}`, icon: <ExclamationCircleFilled style={{ fontSize: 11 }} />, className: 'chat-source-tag--trust-low' },
                                  }[trustLevel];
                                  return (
                                    <div key={cidx} className="chat-source-item">
                                      <div className="chat-source-header">
                                        <FileTextOutlined style={{ fontSize: 14, color: 'var(--color-accent)', flexShrink: 0 }} />
                                        <span
                                          className="chat-source-title"
                                          onClick={() => navigateToDoc(cite.docId)}
                                          style={{ cursor: 'pointer' }}
                                        >
                                          {cite.title || `相关度 ${cite.score.toFixed(2)}`}
                                        </span>
                                      </div>
                                      <div className="chat-source-meta">
                                        <span className={cn('chat-source-tag', trustConfig.className)}>
                                          {trustConfig.icon} {trustConfig.label}
                                        </span>
                                        <span className="chat-source-tag">v{cite.version}</span>
                                        <span className="chat-source-tag">第{cite.page}页</span>
                                        {cite.sourceChannels && cite.sourceChannels.length > 0 && cite.sourceChannels.map(ch => (
                                          <Tag key={ch} color={ch === 'DENSE' ? 'blue' : ch === 'SPARSE' ? 'green' : ch === 'STRUCTURED' ? 'orange' : ch === 'FAQ' ? 'cyan' : 'default'} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>{ch}</Tag>
                                        ))}
                                        <button
                                          className="chat-source-view-btn"
                                          onClick={() => openSourcePreview(cite)}
                                          title="查看原文并高亮"
                                        >
                                          <EyeOutlined style={{ fontSize: 11 }} />
                                          查看原文
                                        </button>
                                      </div>
                                      <p className="chat-source-quote">{cite.text}</p>
                                    </div>
                                  );
                                })}
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

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="chat-input-area">
              <div className={cn('chat-input-box', 'focus-ring', isInputFocused && 'chat-input-box--focused', selectedSkill && 'chat-input-box--skilled')} style={slashMenuOpen ? { overflow: 'visible' } : undefined}>
                <div className="chat-input-toolbar">
                  {/* 检索范围选择器 — only for RAG experts */}
                  {activeAgent?.expertType !== 'assistant' && (
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
                  )}

                  <div style={{ flex: 1 }} />


                  {/* 技能选择器 — only for RAG mode */}
                  {activeAgent?.expertType !== 'assistant' && (
                    selectedSkill ? (
                      <button
                        type="button"
                        className="skill-active-chip"
                        onClick={() => setSelectedSkill(null)}
                        title="点击清除当前技能"
                      >
                        <ThunderboltOutlined style={{ fontSize: 11 }} />
                        {'icon' in selectedSkill && selectedSkill.icon ? (
                          <span style={{ fontSize: 12 }}>{selectedSkill.icon}</span>
                        ) : null}
                        <span>{selectedSkill.name}</span>
                        <span className="skill-active-chip__close" aria-label="清除">×</span>
                      </button>
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


                          {!hasAnySkills && (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description={
                                <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                                  暂无可用扩展技能<br />
                                  前往<Button variant="ghost" size="xs" onClick={() => router.push('/skills')} style={{ fontSize: 12, padding: '0 4px', height: 'auto' }}>技能中心</Button>配置
                                </div>
                              }
                              style={{ padding: '20px 0' }}
                            />
                          )}
                        </div>
                      )}
                    >
                      <button
                        type="button"
                        className={cn('skill-trigger-chip', skillPopoverOpen && 'skill-trigger-chip--open')}
                      >
                        <ThunderboltOutlined style={{ fontSize: 12 }} />
                        <span>更多技能</span>
                      </button>
                    </Popover>
                  )
                  )}
                </div>

                <div className="chat-input-body" style={{ position: 'relative' }}>
                  <SlashCommandMenu
                    visible={slashMenuOpen}
                    filter={slashFilter}
                    onSelect={(cmd) => {
                      handleSend(`/${cmd.name}`);
                    }}
                    onClose={() => {
                      setSlashMenuOpen(false);
                      setSlashFilter('');
                    }}
                    inputRef={inputRef}
                  />
                  <TextArea
                    ref={inputRef as React.RefObject<any>}
                    value={input}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInput(val);
                      if (val.startsWith('/')) {
                        setSlashMenuOpen(true);
                        setSlashFilter(val);
                      } else {
                        setSlashMenuOpen(false);
                        setSlashFilter('');
                      }
                    }}
                    onPressEnter={(e) => {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        if (isLoading || isStreaming) return;
                        handleSend();
                      }
                    }}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => {
                      setIsInputFocused(false);
                      setTimeout(() => {
                        setSlashMenuOpen(false);
                        setSlashFilter('');
                      }, 200);
                    }}
                    placeholder={selectedSkill ? `[${selectedSkill.name}] 输入你的问题...` : '输入你的问题...'}
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

                  <Space size={8}>
                    {voiceSupported.current && (
                      <Tooltip title={isListening ? '点击停止' : '语音输入'}>
                        <Button
                          variant={isListening ? 'primary' : 'ghost'}
                          size="icon"
                          icon={isListening ? <AudioMutedOutlined /> : <AudioOutlined />}
                          onClick={() => isListening ? stopVoiceInput() : startVoiceInput()}
                          style={{
                            height: 32,
                            width: 32,
                            borderRadius: 8,
                            ...(isListening ? {} : { color: 'var(--color-secondary)' }),
                          }}
                          className={isListening ? 'voice-btn--listening' : ''}
                          aria-label={isListening ? '停止语音输入' : '语音输入'}
                        />
                      </Tooltip>
                    )}
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
                  </Space>
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
            {activeAgent && (
              <div className="chat-context-item">
                <div className="chat-context-item__head">
                  <span className="chat-context-item__role chat-context-item__role--assistant">当前专家</span>
                  <span className="chat-context-item__time">{activeAgent.category}</span>
                </div>
                <p className="chat-context-item__text">
                  {activeAgent.icon} {activeAgent.name}：{activeAgent.description}
                </p>
                <div className="chat-context-item__refs">
                  <BookOutlined />
                  <span>绑定知识空间 {activeAgent.spaceIds.length || '全部'}</span>
                </div>
                <div className="chat-context-item__line" />
              </div>
            )}
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
        <PipelineTraceView
          trace={selectedTrace}
          loading={traceLoading}
          traceId={selectedTraceId}
        />
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

      {/* 引用原文预览 */}
      <FilePreview
        docId={previewDocId}
        version={previewVersion}
        filename={previewFilename}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        initialPage={previewPage}
        highlightText={previewHighlight}
      />
    </AppLayout>
  );
}

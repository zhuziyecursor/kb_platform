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
  Divider,
  Collapse,
  Tooltip,
} from 'antd';
import {
  RobotOutlined,
  UserOutlined,
  SendOutlined,
  BookOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { ChatMessage, Citation } from '@/types';
import CommandBar from '@/components/LUI/CommandBar';
import type { LUIAction } from '@/types';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ============== Mock Citations ==============
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
  const [showCitations, setShowCitations] = useState(false);
  const [lastCitations, setLastCitations] = useState<Citation[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // LUI Action Handler
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
    setShowCitations(false);

    // 模拟 RAG 处理延迟
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
    setLastCitations(MOCK_CITATIONS);
    setShowCitations(true);
    setIsLoading(false);
  }, [input]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    });
  };

  return (
    <div style={{ padding: 24, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CommandBar onAction={handleLUIAction} />

      {/* 页面标题 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <RobotOutlined style={{ fontSize: 22, color: '#722ed1' }} />
          <Title level={4} style={{ margin: 0 }}>知识问答</Title>
          <Tag color="purple">RAG + LLM</Tag>
        </Space>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          基于知识库文档，返回带引用的可信答案。
        </Paragraph>
      </div>

      {/* 聊天区域 */}
      <Card
        style={{
          flex: 1,
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        styles={{
          body: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            overflow: 'hidden',
          },
        }}
      >
        {/* 消息列表 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {messages.length === 0 && !isLoading && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                color: '#d9d9d9',
              }}
            >
              <RobotOutlined style={{ fontSize: 48 }} />
              <Text type="secondary">开始提问吧，例如："采购合同审批流程是什么？"</Text>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 }}>
                {['采购合同审批流程', '信息安全制度有哪些', '绩效考核如何计算'].map((q) => (
                  <Tag
                    key={q}
                    onClick={() => setInput(q)}
                    style={{ cursor: 'pointer' }}
                    color="processing"
                  >
                    {q}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              <Space align="top" style={{ marginBottom: 8 }}>
                <Avatar
                  icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  style={{
                    background: msg.role === 'user' ? '#1677ff' : '#722ed1',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <Space>
                    <Text strong>{msg.role === 'user' ? '你' : '知识库助手'}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {dayjs(msg.timestamp).format('HH:mm:ss')}
                    </Text>
                  </Space>

                  {/* 消息内容 */}
                  <div
                    style={{
                      marginTop: 6,
                      padding: '10px 14px',
                      background: msg.role === 'user' ? '#1677ff' : '#fafafa',
                      color: msg.role === 'user' ? '#fff' : 'inherit',
                      borderRadius: 8,
                      maxWidth: '85%',
                    }}
                  >
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'inherit',
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.7,
                      }}
                    >
                      {msg.content}
                    </pre>
                  </div>

                  {/* 引用展示 */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <Collapse
                        ghost
                        size="small"
                        items={[
                          {
                            key: '1',
                            label: (
                              <Space>
                                <BookOutlined />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  引用来源 ({msg.citations!.length} 篇)
                                </Text>
                                {msg.traceId && (
                                  <Text type="secondary" style={{ fontSize: 10 }}>
                                    trace_id: {msg.traceId}
                                  </Text>
                                )}
                              </Space>
                            ),
                            children: (
                              <List
                                size="small"
                                dataSource={msg.citations}
                                renderItem={(cite, index) => (
                                  <List.Item
                                    style={{
                                      padding: '8px 0',
                                      borderBottom:
                                        index < msg.citations!.length - 1
                                        ? '1px dashed #f0f0f0'
                                        : 'none',
                                    }}
                                  >
                                    <div style={{ width: '100%' }}>
                                      <Space style={{ marginBottom: 4 }}>
                                        <Tag color="blue">{index + 1}</Tag>
                                        <Text strong style={{ fontSize: 13 }}>
                                          {cite.title}
                                        </Text>
                                        <Tag style={{ fontSize: 10 }}>
                                          v{cite.version}
                                        </Tag>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                          第{cite.page}页 · {cite.sectionPath}
                                        </Text>
                                        <Tag color="green" style={{ fontSize: 10 }}>
                                          相似度 {(cite.score * 100).toFixed(0)}%
                                        </Tag>
                                        <Tooltip title="复制引用文本">
                                          <Button
                                            type="text"
                                            size="small"
                                            icon={<CopyOutlined />}
                                            onClick={() => copyToClipboard(cite.text)}
                                          />
                                        </Tooltip>
                                      </Space>
                                      <Paragraph
                                        type="secondary"
                                        style={{
                                          margin: 0,
                                          fontSize: 12,
                                          padding: '6px 8px',
                                          background: '#f5f5f5',
                                          borderRadius: 4,
                                          borderLeft: '3px solid #1677ff',
                                        }}
                                      >
                                        {cite.text}
                                      </Paragraph>
                                    </div>
                                  </List.Item>
                                )}
                              />
                            ),
                          },
                        ]}
                      />
                    </div>
                  )}
                </div>
              </Space>
            </div>
          ))}

          {isLoading && (
            <Space align="top">
              <Avatar icon={<RobotOutlined />} style={{ background: '#722ed1' }} />
              <div
                style={{
                  padding: '12px 14px',
                  background: '#fafafa',
                  borderRadius: 8,
                  maxWidth: '70%',
                }}
              >
                <Spin size="small" />{' '}
                <Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
                  正在检索知识库并生成答案...
                </Text>
              </div>
            </Space>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div
          style={{
            borderTop: '1px solid #f0f0f0',
            padding: '16px 24px',
            background: '#fff',
          }}
        >
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
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={isLoading}
              disabled={!input.trim()}
              style={{ height: 'auto', minHeight: 36 }}
            >
              发送
            </Button>
          </Space.Compact>

          <div
            style={{
              marginTop: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space>
              <HistoryOutlined />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {messages.length > 0 ? `${messages.length} 条对话` : '新对话'}
              </Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              💡 回答基于知识库文档，带有引用标注，点击可查看来源
            </Text>
          </div>
        </div>
      </Card>
    </div>
  );
}

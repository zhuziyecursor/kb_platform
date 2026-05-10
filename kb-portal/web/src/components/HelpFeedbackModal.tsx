'use client';

import React, { useState } from 'react';
import { Modal, Typography, Collapse, Button, Space, Divider } from 'antd';
import {
  QuestionCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  MailOutlined,
  PhoneOutlined,
  RightOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

const FAQ_ITEMS = [
  {
    key: 'faq-1',
    q: '如何上传文档到知识库？',
    a: '在工作台点击「上传文档」卡片，或进入「知识空间」选择一个空间后点击上传按钮。支持 PDF、Word、PPT、Excel、TXT、Markdown 格式，文件大小不超过 5MB。',
  },
  {
    key: 'faq-2',
    q: '文档上传后多久可以检索到？',
    a: '文档上传后，系统会在 5 分钟内完成解析、切分、向量化并入库。之后即可通过知识问答功能检索到该文档内容。',
  },
  {
    key: 'faq-3',
    q: '如何创建知识空间？',
    a: '进入「知识空间」页面，点击「新建知识空间」按钮。填写空间名称、描述，选择文档切分策略（智能切分、均匀切分等），即可创建。',
  },
  {
    key: 'faq-4',
    q: '知识问答的引用是如何生成的？',
    a: '系统基于检索到的文档片段生成回答，并标注引用来源。每个引用包含文档标题、页码、相关段落原文和相似度评分，点击可跳转查看原文。',
  },
  {
    key: 'faq-5',
    q: '为什么有些文档检索不到？',
    a: '可能原因：① 文档还在处理中（状态为「处理中」）；② 该文档所属空间未对您开放权限；③ 检索词与文档内容不匹配。建议尝试更换关键词或扩大检索范围。',
  },
  {
    key: 'faq-6',
    q: '如何管理文档的访问权限？',
    a: '在上传文档时或文档详情页，可设置 ACL 权限。系统支持按部门、角色分配访问权限。如需授权，请联系空间管理员。',
  },
  {
    key: 'faq-7',
    q: '支持哪些文档格式？',
    a: '一期支持：PDF、Word（.doc/.docx）、PPT（.ppt/.pptx）、Excel（.xls/.xlsx）、TXT、Markdown。不支持扫描件（图片型 PDF）和带密码保护的文档。',
  },
];

const CONTACTS = [
  { icon: <MailOutlined />, label: '联系管理员', value: 'admin@company.com' },
  { icon: <PhoneOutlined />, label: '技术支持', value: '400-888-8888' },
  { icon: <MessageOutlined />, label: '企业微信', value: '知识智库答疑群' },
];

interface HelpFeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpFeedbackModal({ open, onClose }: HelpFeedbackModalProps) {
  const [activeKeys, setActiveKeys] = useState<string[]>(['faq-1']);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <QuestionCircleOutlined style={{ color: 'var(--color-accent)', fontSize: 18 }} />
          <span style={{ fontWeight: 600 }}>帮助与反馈</span>
        </div>
      }
      styles={{
        body: { padding: '16px 24px 24px' },
      }}
      destroyOnClose
    >
      {/* FAQ */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <FileTextOutlined style={{ fontSize: 13, color: 'var(--color-accent)' }} />
          <Text strong style={{ fontSize: 13 }}>常见问题</Text>
        </div>
        <Collapse
          ghost
          activeKey={activeKeys}
          onChange={(keys) => setActiveKeys(keys as string[])}
          expandIcon={({ isActive }) => (
            <RightOutlined
              style={{
                fontSize: 11,
                color: 'var(--color-secondary)',
                transform: isActive ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          )}
          style={{ background: 'transparent' }}
          items={FAQ_ITEMS.map((item) => ({
            key: item.key,
            label: (
              <Text style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)' }}>
                {item.q}
              </Text>
            ),
            children: (
              <Paragraph
                style={{
                  fontSize: 13,
                  color: 'var(--color-secondary)',
                  margin: 0,
                  lineHeight: 1.7,
                }}
              >
                {item.a}
              </Paragraph>
            ),
          }))}
        />
      </div>

      <Divider style={{ margin: '0 0 20px' }} />

      {/* Contacts */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <MessageOutlined style={{ fontSize: 13, color: 'var(--color-accent)' }} />
          <Text strong style={{ fontSize: 13 }}>联系我们</Text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CONTACTS.map((c, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--color-muted)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Space size={8}>
                <span style={{ color: 'var(--color-secondary)', fontSize: 14 }}>{c.icon}</span>
                <Text style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{c.label}</Text>
              </Space>
              <Text style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)' }}>
                {c.value}
              </Text>
            </div>
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop: 20,
        padding: '10px 14px',
        background: 'rgba(37, 99, 235, 0.06)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(37, 99, 235, 0.12)',
        textAlign: 'center',
      }}>
        <Text style={{ fontSize: 12, color: 'var(--color-secondary)' }}>
          问题未能解决？请联系管理员或提交工单，我们会尽快处理。
        </Text>
      </div>
    </Modal>
  );
}

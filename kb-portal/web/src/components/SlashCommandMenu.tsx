'use client';

import React, { useMemo } from 'react';
import type { ChatMessage } from '@/types';

export interface SlashCommand {
  name: string;
  description: string;
  icon: string;
  /** Executed when the command is triggered */
  execute: (ctx: SlashCommandContext) => void;
}

export interface SlashCommandContext {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  handleSend: (queryText?: string, opts?: { forceAssistant?: boolean }) => Promise<void>;
  setSessionRefresh: React.Dispatch<React.SetStateAction<number>>;
}

function exportToHtml(messages: ChatMessage[]): string {
  const rows = messages
    .filter((m) => m.content?.trim())
    .map((m) => {
      const role = m.role === 'user' ? '用户' : 'AI 助手';
      const content = m.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      const citations = m.citations?.length
        ? `<div style="margin-top:8px;font-size:12px;color:#6b7280;">📎 ${m.citations.map((c) => `${c.title || '来源'} (${c.sectionPath || ''})`).join(' | ')}</div>`
        : '';
      return `<div style="margin-bottom:20px;padding:12px 16px;border-radius:12px;background:${m.role === 'user' ? '#eff6ff' : '#f9fafb'};border:1px solid ${m.role === 'user' ? '#bfdbfe' : '#e5e7eb'};">
        <div style="font-size:11px;color:#9ca3af;margin-bottom:6px;font-weight:600;">${role}</div>
        <div style="font-size:14px;line-height:1.7;color:#1f2937;">${content}</div>
        ${citations}
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>知识库对话记录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f3f4f6; padding: 40px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 20px; color: #1f2937; margin-bottom: 8px; }
    .meta { font-size: 12px; color: #9ca3af; margin-bottom: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📝 知识库对话记录</h1>
    <div class="meta">导出时间：${new Date().toLocaleString('zh-CN')} · 共 ${messages.filter((m) => m.content?.trim()).length} 条消息</div>
    ${rows}
  </div>
</body>
</html>`;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'export',
    description: '导出当前对话为 HTML 文件',
    icon: '📥',
    execute: (ctx) => {
      if (ctx.messages.length === 0) return;
      const html = exportToHtml(ctx.messages);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kb-chat-${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ctx.setInput('');
    },
  },
  {
    name: 'summary',
    description: '对当前对话进行总结',
    icon: '📋',
    execute: (ctx) => {
      if (ctx.messages.length === 0) return;
      const conversationText = ctx.messages
        .filter((m) => m.content?.trim())
        .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
        .join('\n\n');

      const summaryQuery = `你是一位资深的专业知识顾问，请以专业、精炼的风格对以下对话内容进行结构化总结。

要求：
1. 用一段话概括对话的核心主题与脉络
2. 列出用户关注的关键问题（3-5 条要点）
3. 提炼助手给出的核心结论与关键信息
4. 保持客观、准确，使用专业术语

对话内容：
${conversationText}`;

      ctx.setInput('');
      ctx.handleSend(summaryQuery, { forceAssistant: true });
    },
  },
  {
    name: 'clear',
    description: '清除当前对话',
    icon: '🗑️',
    execute: (ctx) => {
      ctx.setMessages([]);
      ctx.setSessionId(undefined);
      ctx.setInput('');
      ctx.setSessionRefresh((n) => n + 1);
    },
  },
];

interface Props {
  visible: boolean;
  filter: string;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export default function SlashCommandMenu({ visible, filter, onSelect, onClose, inputRef }: Props) {
  const filtered = useMemo(() => {
    if (!filter.startsWith('/')) return SLASH_COMMANDS;
    const term = filter.slice(1).toLowerCase();
    if (!term) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (c) => c.name.toLowerCase().includes(term) || c.description.toLowerCase().includes(term)
    );
  }, [filter]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: '100%',
      left: 0,
      right: 0,
      marginBottom: 8,
      background: 'var(--color-surface, #fff)',
      border: '1px solid var(--color-border, #e5e7eb)',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      overflow: 'hidden',
      zIndex: 100,
      maxHeight: 260,
      overflowY: 'auto',
    }}>
      <div style={{
        padding: '6px 12px',
        fontSize: 11,
        color: 'var(--color-muted-foreground, #9ca3af)',
        borderBottom: '1px solid var(--color-border, #e5e7eb)',
        fontWeight: 600,
      }}>
        内置命令
      </div>
      {filtered.map((cmd) => (
        <div
          key={cmd.name}
          onClick={() => onSelect(cmd)}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'rgba(37,99,235,0.06)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            cursor: 'pointer',
            transition: 'background 0.12s',
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0 }}>{cmd.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-foreground, #1f2937)' }}>
              /{cmd.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted-foreground, #6b7280)', marginTop: 1 }}>
              {cmd.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';

import React, { useMemo } from 'react';
import { Tooltip } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { cn } from '@/lib/utils';
import type { Citation } from '@/types';

interface FollowUpQuestion {
  text: string;
}

interface ParsedAnswer {
  mainContent: string;
  followUps: FollowUpQuestion[];
}

function trustLevelOf(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function CitationPreview({ citation, index }: { citation: Citation; index: number }) {
  const trust = trustLevelOf(citation.score);
  const trustLabel = trust === 'high' ? '高可信' : trust === 'medium' ? '中可信' : '低可信';
  return (
    <div className="cite-preview">
      <div className="cite-preview__head">
        <span className={`cite-preview__num cite-preview__num--${trust}`}>{index}</span>
        <div className="cite-preview__title">
          <FileTextOutlined style={{ fontSize: 12, marginRight: 6, opacity: 0.7 }} />
          {citation.title || '未命名文档'}
        </div>
      </div>
      <div className="cite-preview__meta">
        <span className={`cite-preview__trust cite-preview__trust--${trust}`}>{trustLabel} {citation.score.toFixed(2)}</span>
        <span className="cite-preview__sep">·</span>
        <span>v{citation.version}</span>
        <span className="cite-preview__sep">·</span>
        <span>第 {citation.page} 页</span>
      </div>
      <p className="cite-preview__quote">{citation.text}</p>
      <div className="cite-preview__hint">点击查看原文</div>
    </div>
  );
}

/**
 * Parse "你可能还想了解" section from the LLM response.
 * Extracts bullet-pointed follow-up questions for clickable chips.
 */
function parseAnswer(raw: string): ParsedAnswer {
  const markers = [
    '### 你可能还想了解',
    '## 你可能还想了解',
    '你可能还想了解',
  ];

  let splitIndex = -1;
  let matchedMarker = '';
  for (const marker of markers) {
    const idx = raw.indexOf(marker);
    if (idx !== -1) {
      splitIndex = idx;
      matchedMarker = marker;
      break;
    }
  }

  if (splitIndex === -1) {
    return { mainContent: raw, followUps: [] };
  }

  const mainContent = raw.slice(0, splitIndex).trim();
  const followUpSection = raw.slice(splitIndex + matchedMarker.length);

  const followUps: FollowUpQuestion[] = [];
  const lines = followUpSection.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Match "- question text" or "1. question text" patterns
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    const numberedMatch = trimmed.match(/^\d+[.)]\s*(.+)/);
    const match = bulletMatch || numberedMatch;
    if (match) {
      const text = match[1].trim();
      if (text.length > 0) {
        followUps.push({ text });
      }
    }
  }

  return { mainContent, followUps };
}

interface RenderContext {
  onCitationClick?: (citationIndex: number) => void;
  citations?: Citation[];
}

function renderLine(line: string, lineIdx: number, ctx: RenderContext): React.ReactNode {
  if (line.startsWith('### ')) {
    return (
      <h3 key={lineIdx} className="answer-h3">
        {renderInline(line.slice(4), ctx)}
      </h3>
    );
  }
  if (line.startsWith('## ')) {
    return (
      <h2 key={lineIdx} className="answer-h2">
        {renderInline(line.slice(3), ctx)}
      </h2>
    );
  }
  if (/^\*\*.+\*\*$/.test(line.trim())) {
    return (
      <p key={lineIdx} className="answer-bold-label">
        {renderInline(line.trim(), ctx)}
      </p>
    );
  }
  return (
    <p key={lineIdx} className="answer-p">
      {renderInline(line, ctx)}
    </p>
  );
}

function renderInline(text: string, ctx: RenderContext): React.ReactNode {
  const { onCitationClick, citations } = ctx;
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[(\d+)\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      parts.push(<strong key={`b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={`c-${match.index}`} className="answer-code">{match[4]}</code>);
    } else if (match[5]) {
      const citeIndex = parseInt(match[6], 10);
      const cite = citations?.[citeIndex - 1];
      const trust = cite ? trustLevelOf(cite.score) : 'high';
      const pill = (
        <button
          key={`cite-${match.index}`}
          type="button"
          className={cn(
            'answer-cite-pill',
            `answer-cite-pill--${trust}`,
            onCitationClick && 'answer-cite-pill--clickable',
          )}
          onClick={onCitationClick ? () => onCitationClick(citeIndex - 1) : undefined}
          aria-label={cite ? `引用 ${citeIndex}：${cite.title}` : `引用 ${citeIndex}`}
        >
          {citeIndex}
        </button>
      );
      parts.push(
        cite ? (
          <Tooltip
            key={`cite-tip-${match.index}`}
            title={<CitationPreview citation={cite} index={citeIndex} />}
            placement="top"
            color="#fff"
            overlayClassName="cite-tooltip"
            mouseEnterDelay={0.15}
          >
            {pill}
          </Tooltip>
        ) : pill,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

interface AnswerRendererProps {
  content: string;
  citations?: Citation[];
  onFollowUpClick?: (question: string) => void;
  onCitationClick?: (citationIndex: number) => void;
  className?: string;
}

export default function AnswerRenderer({ content, citations, onFollowUpClick, onCitationClick, className }: AnswerRendererProps) {
  const parsed = useMemo(() => parseAnswer(content), [content]);

  const mainLines = useMemo(() => {
    return parsed.mainContent.split('\n');
  }, [parsed.mainContent]);

  const renderedContent = useMemo(() => {
    const elements: React.ReactNode[] = [];
    let codeBlockLines: string[] = [];
    let inCodeBlock = false;
    const ctx: RenderContext = { onCitationClick, citations };

    for (let i = 0; i < mainLines.length; i++) {
      const line = mainLines[i];

      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`cb-${i}`} className="answer-code-block">
              <code>{codeBlockLines.join('\n')}</code>
            </pre>
          );
          codeBlockLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      if (line.trim() === '') {
        elements.push(<div key={i} className="answer-spacer" />);
        continue;
      }

      elements.push(renderLine(line, i, ctx));
    }

    return elements;
  }, [mainLines, onCitationClick, citations]);

  return (
    <div className={cn('answer-rendered', className)}>
      {renderedContent}

      {parsed.followUps.length > 0 && (
        <div className="answer-followups">
          <div className="answer-followups-label">你可能还想了解</div>
          <div className="answer-followups-list">
            {parsed.followUps.map((fq, idx) => (
              <button
                key={idx}
                className="answer-followup-chip"
                onClick={() => onFollowUpClick?.(fq.text)}
                type="button"
              >
                {fq.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

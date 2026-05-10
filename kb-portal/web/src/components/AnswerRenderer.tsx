'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface FollowUpQuestion {
  text: string;
}

interface ParsedAnswer {
  mainContent: string;
  followUps: FollowUpQuestion[];
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

/**
 * Render a single line of markdown-like text into JSX.
 * Handles: ### headings, **bold**, `code`, [N] citations.
 */
function renderLine(line: string, lineIdx: number): React.ReactNode {
  // H3 heading
  if (line.startsWith('### ')) {
    return (
      <h3 key={lineIdx} className="answer-h3">
        {renderInline(line.slice(4))}
      </h3>
    );
  }
  // H2 heading (not "你可能还想了解" which is already stripped)
  if (line.startsWith('## ')) {
    return (
      <h2 key={lineIdx} className="answer-h2">
        {renderInline(line.slice(3))}
      </h2>
    );
  }
  // Bold-only line (section labels without heading marker)
  if (/^\*\*.+\*\*$/.test(line.trim())) {
    return (
      <p key={lineIdx} className="answer-bold-label">
        {renderInline(line.trim())}
      </p>
    );
  }

  return (
    <p key={lineIdx} className="answer-p">
      {renderInline(line)}
    </p>
  );
}

/**
 * Render inline markdown: **bold**, `code`, [N] citations.
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Pattern matches: **bold**, `code`, [N]
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[(\d+)\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(
        <strong key={`b-${match.index}`}>{match[2]}</strong>
      );
    } else if (match[3]) {
      // `code`
      parts.push(
        <code key={`c-${match.index}`} className="answer-code">{match[4]}</code>
      );
    } else if (match[5]) {
      // [N] citation
      parts.push(
        <sup key={`cite-${match.index}`} className="answer-cite">[{match[6]}]</sup>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

interface AnswerRendererProps {
  content: string;
  onFollowUpClick?: (question: string) => void;
  className?: string;
}

export default function AnswerRenderer({ content, onFollowUpClick, className }: AnswerRendererProps) {
  const parsed = useMemo(() => parseAnswer(content), [content]);

  const mainLines = useMemo(() => {
    return parsed.mainContent.split('\n');
  }, [parsed.mainContent]);

  const renderedContent = useMemo(() => {
    const elements: React.ReactNode[] = [];
    let codeBlockLines: string[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < mainLines.length; i++) {
      const line = mainLines[i];

      // Code block handling
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

      // Skip empty lines
      if (line.trim() === '') {
        elements.push(<div key={i} className="answer-spacer" />);
        continue;
      }

      elements.push(renderLine(line, i));
    }

    return elements;
  }, [mainLines]);

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

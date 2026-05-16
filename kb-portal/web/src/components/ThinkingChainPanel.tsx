'use client';

import React, { useState } from 'react';
import { LoadingOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import type { StageEvent } from '@/types';
import { PIPELINE_STAGE_LABELS, formatStageName } from './PipelineTraceView';

interface ThinkingChainPanelProps {
  stages: StageEvent[];
  streaming: boolean;
  traceId?: string;
}

export default function ThinkingChainPanel({ stages, streaming, traceId }: ThinkingChainPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(false);

  if (!stages || stages.length === 0) return null;

  const totalMs = stages.length > 0 ? stages[stages.length - 1].elapsedMs : 0;
  const stageCount = stages.length;

  // Auto-expand during streaming; respect user's manual collapse
  const isExpanded = streaming ? !userCollapsed : expanded;

  // Collapsed state: one-line gray pill
  if (!isExpanded) {
    return (
      <div
        className="chat-thinking-collapsed"
        onClick={() => { setExpanded(true); setUserCollapsed(false); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') { setExpanded(true); setUserCollapsed(false); } }}
      >
        <RightOutlined className="chat-thinking-icon" />
        <span className="chat-thinking-label">思考过程</span>
        <span className="chat-thinking-meta">
          {stageCount} 步 · {totalMs}ms
        </span>
      </div>
    );
  }

  // Expanded state: stage list
  return (
    <div className="chat-thinking-expanded">
      <div
        className="chat-thinking-header"
        onClick={() => { setExpanded(false); setUserCollapsed(true); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') { setExpanded(false); setUserCollapsed(true); } }}
      >
        <DownOutlined className="chat-thinking-icon" />
        <span className="chat-thinking-label">思考过程</span>
        <span className="chat-thinking-meta">
          {stageCount} 步 · {totalMs}ms
        </span>
      </div>
      <div className="chat-thinking-stages">
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1;
          const isRunning = streaming && isLast;
          return (
            <div key={`${stage.stage}-${idx}`} className="chat-thinking-stage">
              <div className="chat-thinking-stage-head">
                <span className="chat-thinking-stage-name">
                  {formatStageName(stage.stage)}
                </span>
                <span className="chat-thinking-stage-time">
                  {isRunning ? (
                    <LoadingOutlined style={{ fontSize: 12 }} />
                  ) : (
                    `${stage.durationMs}ms`
                  )}
                </span>
              </div>
              {stage.summary && (
                <div className="chat-thinking-stage-summary">
                  {renderSummary(stage.stage, stage.summary)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderSummary(stage: string, summary: Record<string, unknown>): React.ReactNode {
  // Render stage-specific summary as a concise Chinese sentence
  switch (stage) {
    case 'query_rewrite':
    case 'query_plan':
      return (
        <>
          {summary.rewrittenQuery && (
            <span>改写: &quot;{String(summary.rewrittenQuery)}&quot;</span>
          )}
          {summary.intent && <span> · 意图 {String(summary.intent)}</span>}
          {summary.searchMode && <span> · 模式 {String(summary.searchMode)}</span>}
        </>
      );
    case 'bm25_search':
      return <span>命中 {String(summary.hits || 0)} 条</span>;
    case 'milvus_search':
      return (
        <span>
          召回 {String(summary.recallCount || 0)} / Top-{String(summary.topK || 0)}
          {summary.denseFailed ? ' · 失败' : ''}
        </span>
      );
    case 'acl_post_filter':
      return (
        <span>
          保留 {String(summary.kept || 0)} · 过滤 {String(summary.dropped || 0)}
        </span>
      );
    case 'channel_executor':
      if (summary.channelHits && typeof summary.channelHits === 'object') {
        const hits = summary.channelHits as Record<string, number>;
        const parts = Object.entries(hits)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}:${v}`);
        return <span>{parts.join(' · ')}</span>;
      }
      return null;
    case 'rerank':
      return (
        <span>
          精排 Top-{String(summary.topN || 0)}
          {summary.fallback ? ' · fallback' : ''}
        </span>
      );
    case 'acl_verify':
      return <span>引用 {String(summary.citationsCount || 0)} 条</span>;
    case 'refusal_check':
      return summary.reason ? <span>拒答: {String(summary.reason)}</span> : null;
    case 'prompt_build':
      return (
        <span>
          Prompt ~{String(summary.estimatedTokens || 0)} tokens · 引用{' '}
          {String(summary.includedCitations || 0)}/
          {Number(summary.includedCitations || 0) + Number(summary.droppedCitations || 0)}
          {Number(summary.truncatedCitations || 0) > 0
            ? ` · 压缩 ${summary.truncatedCitations}`
            : ''}
        </span>
      );
    default:
      return null;
  }
}

'use client';

import React from 'react';
import { Typography, Tag, Progress, Alert } from 'antd';
import {
  FileTextOutlined,
  LoadingOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import type { RagPipelineTraceResponse } from '@/api/http-client';
import { buildGrafanaExploreUrl } from '@/lib/grafana-link';
import { Button } from '@/components/ui';

const { Text } = Typography;

// Exported for use in ThinkingChainPanel
export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  cache_lookup: '缓存检查',
  session_context: '会话上下文',
  query_rewrite: '查询改写',
  query_plan: '查询规划',
  intent_route: '意图路由',
  embedding: '查询向量化',
  faq_check: 'FAQ 匹配',
  faq_shortcut: 'FAQ 快捷匹配',
  bm25_search: 'BM25 检索',
  milvus_search: 'Milvus 召回',
  channel_executor: '多通道检索',
  acl_post_filter: 'ACL 预过滤',
  rrf_fusion: 'RRF 融合',
  hybrid_fusion: '混合融合',
  clause_fast_path: '条款快速匹配',
  space_filter: '知识空间过滤',
  rerank: '精排',
  mmr_diversity: 'MMR 多样性选择',
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

export function formatStageName(stage: string): string {
  return PIPELINE_STAGE_LABELS[stage] || stage;
}

interface PipelineTraceViewProps {
  trace: RagPipelineTraceResponse | null;
  loading: boolean;
  traceId: string | null;
}

export default function PipelineTraceView({ trace, loading, traceId }: PipelineTraceViewProps) {
  if (loading) {
    return (
      <div className="pipeline-trace-loading">
        <LoadingOutlined />
        <span>正在加载链路详情...</span>
      </div>
    );
  }

  if (!trace) {
    return (
      <Alert
        type="warning"
        showIcon
        message="未找到链路记录"
        description={traceId ? `traceId: ${traceId}` : undefined}
      />
    );
  }

  return (
    <div className="pipeline-trace-drawer">
      <div className="pipeline-trace-summary">
        <div>
          <Text type="secondary">Trace ID</Text>
          <div className="pipeline-trace-id">
            <Text code copyable>{trace.traceId}</Text>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tag color={trace.result === 'SUCCESS' ? 'success' : trace.result === 'ERROR' ? 'error' : 'processing'}>
            {trace.result}
          </Tag>
          <a
            href={buildGrafanaExploreUrl({ traceId: trace.traceId })}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" icon={<DashboardOutlined />}>
              Grafana
            </Button>
          </a>
        </div>
      </div>

      <div className="pipeline-trace-metrics">
        <div className="pipeline-trace-metric">
          <span>{trace.totalMs}</span>
          <label>总耗时 ms</label>
        </div>
        <div className="pipeline-trace-metric">
          <span>{trace.recallCount}</span>
          <label>召回</label>
        </div>
        <div className="pipeline-trace-metric">
          <span>{trace.rerankCount}</span>
          <label>精排</label>
        </div>
        <div className="pipeline-trace-metric">
          <span>{trace.citationsCount}</span>
          <label>引用</label>
        </div>
        {trace.promptBudget?.estimatedPromptTokens != null && (
          <div className="pipeline-trace-metric">
            <span>{trace.promptBudget.estimatedPromptTokens}</span>
            <label>Prompt Tokens</label>
          </div>
        )}
      </div>

      <div className="pipeline-trace-flags">
        <Tag color={trace.cacheHit ? 'green' : 'default'}>
          {trace.cacheHit ? '缓存命中' : '未命中缓存'}
        </Tag>
        {trace.firstTokenMs != null && (
          <Tag color="blue">首 Token {trace.firstTokenMs}ms</Tag>
        )}
        {trace.refusalReason && (
          <Tag color="orange">{trace.refusalReason}</Tag>
        )}
        {trace.promptBudget?.enabled != null && (
          <Tag color={trace.promptBudget.enabled ? 'purple' : 'default'}>
            {trace.promptBudget.enabled ? '预算控制开启' : '预算控制关闭'}
          </Tag>
        )}
      </div>

      {trace.rewrittenQuery && trace.rewrittenQuery !== trace.queryText && (
        <div className="pipeline-trace-block">
          <Text type="secondary">改写后查询</Text>
          <p>{trace.rewrittenQuery}</p>
        </div>
      )}

      {trace.promptBudget && Object.keys(trace.promptBudget).length > 0 && (
        <div className="pipeline-trace-block">
          <Text type="secondary">Prompt 预算</Text>
          <div className="pipeline-budget-grid">
            <span>输入预算 {trace.promptBudget.inputBudgetTokens ?? '-'}</span>
            <span>预估 Prompt {trace.promptBudget.estimatedPromptTokens ?? '-'}</span>
            <span>保留引用 {trace.promptBudget.includedCitations ?? '-'}</span>
            <span>丢弃引用 {trace.promptBudget.droppedCitations ?? '-'}</span>
            <span>压缩引用 {trace.promptBudget.truncatedCitations ?? '-'}</span>
            <span>保留历史 {trace.promptBudget.includedHistoryTurns ?? '-'}</span>
            <span>丢弃历史 {trace.promptBudget.droppedHistoryTurns ?? '-'}</span>
          </div>
        </div>
      )}

      <div className="pipeline-trace-section-title">阶段耗时</div>
      <div className="pipeline-stage-list">
        {trace.stageTimings.map((stage, index) => {
          const percent = trace.totalMs > 0
            ? Math.min(100, Math.round((stage.durationMs / trace.totalMs) * 100))
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

      {trace.hitDocs.length > 0 && (
        <>
          <div className="pipeline-trace-section-title">命中文档</div>
          <div className="pipeline-hit-docs">
            {trace.hitDocs.map((doc, index) => (
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

      {trace.errorMessage && (
        <Alert type="error" showIcon message="链路异常" description={trace.errorMessage} />
      )}
    </div>
  );
}

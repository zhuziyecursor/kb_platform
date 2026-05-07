'use client';

import React from 'react';
import { Tag } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  FileTextOutlined,
  EditOutlined,
} from '@ant-design/icons';

// ─── 文档状态 ───────────────────────────────────────────────
export type DocStatusValue = 'DRAFT' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'OFFBOARDED' | 'DEPRECATED';

interface DocStatusConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

export const DOC_STATUS_CONFIG: Record<DocStatusValue, DocStatusConfig> = {
  DRAFT: {
    label: '草稿',
    color: '#64748B',
    bg: 'rgba(100, 116, 139, 0.08)',
    border: 'rgba(100, 116, 139, 0.2)',
    icon: <EditOutlined style={{ fontSize: 11 }} />,
  },
  PENDING: {
    label: '等待中',
    color: '#B45309',
    bg: 'rgba(180, 83, 9, 0.08)',
    border: 'rgba(180, 83, 9, 0.2)',
    icon: <ClockCircleOutlined style={{ fontSize: 11 }} />,
  },
  PROCESSING: {
    label: '处理中',
    color: '#1D4ED8',
    bg: 'rgba(29, 78, 216, 0.08)',
    border: 'rgba(29, 78, 216, 0.2)',
    icon: <SyncOutlined spin style={{ fontSize: 11 }} />,
  },
  READY: {
    label: '已上线',
    color: '#15803D',
    bg: 'rgba(21, 128, 61, 0.08)',
    border: 'rgba(21, 128, 61, 0.2)',
    icon: <CheckCircleOutlined style={{ fontSize: 11 }} />,
  },
  FAILED: {
    label: '失败',
    color: '#B91C1C',
    bg: 'rgba(185, 28, 28, 0.08)',
    border: 'rgba(185, 28, 28, 0.2)',
    icon: <CloseCircleOutlined style={{ fontSize: 11 }} />,
  },
  OFFBOARDED: {
    label: '已下线',
    color: '#7C3AED',
    bg: 'rgba(124, 58, 237, 0.08)',
    border: 'rgba(124, 58, 237, 0.2)',
    icon: <MinusCircleOutlined style={{ fontSize: 11 }} />,
  },
  DEPRECATED: {
    label: '已废弃',
    color: '#475569',
    bg: 'rgba(71, 85, 105, 0.08)',
    border: 'rgba(71, 85, 105, 0.2)',
    icon: <MinusCircleOutlined style={{ fontSize: 11 }} />,
  },
};

interface DocStatusBadgeProps {
  status: DocStatusValue;
  showIcon?: boolean;
}

export function DocStatusBadge({ status, showIcon = true }: DocStatusBadgeProps) {
  const config = DOC_STATUS_CONFIG[status] || DOC_STATUS_CONFIG.DRAFT;
  return (
    <Tag
      style={{
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        padding: '1px 8px',
        lineHeight: 1.4,
        margin: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {showIcon && config.icon}
      {config.label}
    </Tag>
  );
}

// ─── 文档类型 ───────────────────────────────────────────────
export type DocTypeValue = 'REGULATION' | 'POLICY' | 'AUDIT' | 'CONTRACT' | 'MANUAL' | 'OTHER';

interface DocTypeConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const DOC_TYPE_CONFIG: Record<string, DocTypeConfig> = {
  REGULATION: { label: '制度', color: '#1E40AF', bg: 'rgba(30, 64, 175, 0.08)', border: 'rgba(30, 64, 175, 0.2)' },
  POLICY:     { label: '政策', color: '#0369A1', bg: 'rgba(3, 105, 161, 0.08)', border: 'rgba(3, 105, 161, 0.2)' },
  AUDIT:      { label: '审计', color: '#C2410C', bg: 'rgba(194, 65, 12, 0.08)', border: 'rgba(194, 65, 12, 0.2)' },
  CONTRACT:   { label: '合同', color: '#6D28D9', bg: 'rgba(109, 40, 217, 0.08)', border: 'rgba(109, 40, 217, 0.2)' },
  MANUAL:     { label: '手册', color: '#047857', bg: 'rgba(4, 120, 87, 0.08)', border: 'rgba(4, 120, 87, 0.2)' },
  OTHER:      { label: '其他', color: '#475569', bg: 'rgba(71, 85, 105, 0.08)', border: 'rgba(71, 85, 105, 0.2)' },
};

interface DocTypeBadgeProps {
  docType: string;
}

export function DocTypeBadge({ docType }: DocTypeBadgeProps) {
  const config = DOC_TYPE_CONFIG[docType] || DOC_TYPE_CONFIG.OTHER;
  return (
    <Tag
      style={{
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        padding: '1px 8px',
        lineHeight: 1.4,
        margin: 0,
      }}
    >
      {config.label}
    </Tag>
  );
}

// ─── 密级 ───────────────────────────────────────────────
interface SecLevelBadgeProps {
  level: number;
  showIcon?: boolean;
}

const SEC_LEVEL_CONFIG = [
  { label: '公开', color: '#15803D', bg: 'rgba(21, 128, 61, 0.08)', border: 'rgba(21, 128, 61, 0.2)', icon: null },
  { label: '内部', color: '#1D4ED8', bg: 'rgba(29, 78, 216, 0.08)', border: 'rgba(29, 78, 216, 0.2)', icon: null },
  { label: '机密', color: '#B45309', bg: 'rgba(180, 83, 9, 0.08)', border: 'rgba(180, 83, 9, 0.2)', icon: null },
  { label: '秘密', color: '#B91C1C', bg: 'rgba(185, 28, 28, 0.08)', border: 'rgba(185, 28, 28, 0.2)', icon: null },
  { label: '绝密', color: '#7C3AED', bg: 'rgba(124, 58, 237, 0.08)', border: 'rgba(124, 58, 237, 0.2)', icon: null },
];

export function SecLevelBadge({ level, showIcon = false }: SecLevelBadgeProps) {
  const config = SEC_LEVEL_CONFIG[level - 1] || SEC_LEVEL_CONFIG[0];
  return (
    <Tag
      style={{
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        padding: '1px 8px',
        lineHeight: 1.4,
        margin: 0,
      }}
    >
      {showIcon && '🔒 '}
      {config.label}
    </Tag>
  );
}

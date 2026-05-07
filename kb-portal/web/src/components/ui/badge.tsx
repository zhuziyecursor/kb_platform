'use client';

import React, { useState, useEffect } from 'react';
import { Tag } from 'antd';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' | 'ghost';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
}

const lightVariantStyles: Record<BadgeVariant, { color: string; bg: string; border: string }> = {
  default: {
    color: '#475569',
    bg: 'rgba(71, 85, 105, 0.08)',
    border: 'rgba(71, 85, 105, 0.2)',
  },
  secondary: {
    color: '#64748B',
    bg: 'rgba(100, 116, 139, 0.08)',
    border: 'rgba(100, 116, 139, 0.2)',
  },
  success: {
    color: '#16A34A',
    bg: 'rgba(22, 163, 74, 0.08)',
    border: 'rgba(22, 163, 74, 0.2)',
  },
  warning: {
    color: '#D97706',
    bg: 'rgba(217, 119, 6, 0.08)',
    border: 'rgba(217, 119, 6, 0.2)',
  },
  destructive: {
    color: '#DC2626',
    bg: 'rgba(220, 38, 38, 0.08)',
    border: 'rgba(220, 38, 38, 0.2)',
  },
  outline: {
    color: '#1E293B',
    bg: 'transparent',
    border: '#E2E8F0',
  },
  ghost: {
    color: '#1E293B',
    bg: 'transparent',
    border: 'transparent',
  },
};

const darkVariantStyles: Record<BadgeVariant, { color: string; bg: string; border: string }> = {
  default: {
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.2)',
  },
  secondary: {
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.2)',
  },
  success: {
    color: '#22C55E',
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.2)',
  },
  warning: {
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.2)',
  },
  destructive: {
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.2)',
  },
  outline: {
    color: '#E2E8F0',
    bg: 'transparent',
    border: '#334155',
  },
  ghost: {
    color: '#E2E8F0',
    bg: 'transparent',
    border: 'transparent',
  },
};

export function Badge({
  variant = 'default',
  children,
  className,
  icon,
  size = 'md',
}: BadgeProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);

  const variantStyles = isDark ? darkVariantStyles : lightVariantStyles;
  const style = variantStyles[variant];

  return (
    <Tag
      style={{
        color: style.color,
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 'var(--radius-full)',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 500,
        padding: size === 'sm' ? '0 6px' : '1px 10px',
        lineHeight: size === 'sm' ? 1.3 : 1.4,
        margin: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all var(--transition-fast)',
      }}
      className={cn('badge', `badge--${variant}`, className)}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </Tag>
  );
}

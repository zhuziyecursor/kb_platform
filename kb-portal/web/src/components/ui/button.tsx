'use client';

import React, { useState, useEffect } from 'react';
import { Button as AntButton } from 'antd';
import type { ButtonProps as AntButtonProps } from 'antd';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'default' | 'primary' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends Omit<AntButtonProps, 'type' | 'variant' | 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const lightVariantTokens: Record<ButtonVariant, { bg: string; color: string; border: string; hoverBg: string; hoverColor: string }> = {
  default: {
    bg: '#475569',
    color: '#FFFFFF',
    border: '#475569',
    hoverBg: '#3D4A5C',
    hoverColor: '#FFFFFF',
  },
  primary: {
    bg: '#2563EB',
    color: '#FFFFFF',
    border: '#2563EB',
    hoverBg: '#1D4ED8',
    hoverColor: '#FFFFFF',
  },
  destructive: {
    bg: '#DC2626',
    color: '#FFFFFF',
    border: '#DC2626',
    hoverBg: '#B91C1C',
    hoverColor: '#FFFFFF',
  },
  outline: {
    bg: 'transparent',
    color: '#1E293B',
    border: '#E2E8F0',
    hoverBg: '#EAEFF3',
    hoverColor: '#1E293B',
  },
  secondary: {
    bg: '#64748B',
    color: '#FFFFFF',
    border: '#64748B',
    hoverBg: '#94A3B8',
    hoverColor: '#FFFFFF',
  },
  ghost: {
    bg: 'transparent',
    color: '#1E293B',
    border: 'transparent',
    hoverBg: '#EAEFF3',
    hoverColor: '#1E293B',
  },
  link: {
    bg: 'transparent',
    color: '#2563EB',
    border: 'transparent',
    hoverBg: 'transparent',
    hoverColor: '#1D4ED8',
  },
};

const darkVariantTokens: Record<ButtonVariant, { bg: string; color: string; border: string; hoverBg: string; hoverColor: string }> = {
  default: {
    bg: '#64748B',
    color: '#0F172A',
    border: '#64748B',
    hoverBg: '#94A3B8',
    hoverColor: '#0F172A',
  },
  primary: {
    bg: '#3B82F6',
    color: '#FFFFFF',
    border: '#3B82F6',
    hoverBg: '#60A5FA',
    hoverColor: '#FFFFFF',
  },
  destructive: {
    bg: '#EF4444',
    color: '#FFFFFF',
    border: '#EF4444',
    hoverBg: '#F87171',
    hoverColor: '#FFFFFF',
  },
  outline: {
    bg: 'transparent',
    color: '#E2E8F0',
    border: '#334155',
    hoverBg: '#1E293B',
    hoverColor: '#E2E8F0',
  },
  secondary: {
    bg: '#94A3B8',
    color: '#0F172A',
    border: '#94A3B8',
    hoverBg: '#CBD5E1',
    hoverColor: '#0F172A',
  },
  ghost: {
    bg: 'transparent',
    color: '#E2E8F0',
    border: 'transparent',
    hoverBg: '#1E293B',
    hoverColor: '#E2E8F0',
  },
  link: {
    bg: 'transparent',
    color: '#3B82F6',
    border: 'transparent',
    hoverBg: 'transparent',
    hoverColor: '#60A5FA',
  },
};

const sizeTokens: Record<ButtonSize, { height: number; fontSize: number; paddingInline: number; radius: number }> = {
  xs: { height: 24, fontSize: 11, paddingInline: 8, radius: 4 },
  sm: { height: 32, fontSize: 12, paddingInline: 12, radius: 6 },
  md: { height: 36, fontSize: 14, paddingInline: 16, radius: 8 },
  lg: { height: 44, fontSize: 16, paddingInline: 20, radius: 8 },
  icon: { height: 36, fontSize: 14, paddingInline: 8, radius: 8 },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', className, style, ...props }, ref) => {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    }, []);

    const variantStyle = isDark ? darkVariantTokens[variant] : lightVariantTokens[variant];
    const sizeStyle = sizeTokens[size];

    const computedStyle: React.CSSProperties = {
      ...style,
      backgroundColor: variantStyle.bg,
      color: variantStyle.color,
      borderColor: variantStyle.border,
      height: sizeStyle.height,
      fontSize: sizeStyle.fontSize,
      paddingInline: sizeStyle.paddingInline,
      borderRadius: sizeStyle.radius,
      fontWeight: 500,
      transition: 'all var(--transition-fast)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      fontFamily: 'var(--font-sans)',
    };

    return (
      <AntButton
        ref={ref}
        className={cn('btn', `btn--${variant}`, `btn--${size}`, className)}
        style={computedStyle}
        onMouseEnter={(e) => {
          const target = e.currentTarget;
          target.style.backgroundColor = variantStyle.hoverBg;
          target.style.color = variantStyle.hoverColor;
        }}
        onMouseLeave={(e) => {
          const target = e.currentTarget;
          target.style.backgroundColor = variantStyle.bg;
          target.style.color = variantStyle.color;
        }}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

'use client';

import React, { useState, useEffect } from 'react';
import { Select as AntSelect } from 'antd';
import type { SelectProps as AntSelectProps } from 'antd';
import { cn } from '@/lib/utils';

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

export interface SelectProps extends Omit<AntSelectProps, 'options' | 'variant'> {
  options?: SelectOption[];
  selectVariant?: 'default' | 'borderless';
}

export function Select({
  options = [],
  selectVariant = 'default',
  className,
  style,
  ...props
}: SelectProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);

  const baseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-sm)',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
    ...style,
  };

  if (selectVariant === 'borderless') {
    return (
      <AntSelect
        options={options}
        className={cn('select select--borderless', className)}
        style={baseStyle}
        popupClassName={cn('select-dropdown', isDark ? 'select-dropdown--dark' : '')}
        {...props}
      />
    );
  }

  return (
    <AntSelect
      options={options}
      className={cn('select', className)}
      style={baseStyle}
      popupClassName={cn('select-dropdown', isDark ? 'select-dropdown--dark' : '')}
      {...props}
    />
  );
}

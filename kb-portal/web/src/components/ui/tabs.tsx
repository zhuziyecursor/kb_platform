'use client';

import React, { useState, useEffect } from 'react';
import { Tabs as AntTabs } from 'antd';
import type { TabsProps as AntTabsProps } from 'antd';
import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: React.ReactNode;
  children?: React.ReactNode;
}

export interface TabsProps extends Omit<AntTabsProps, 'items' | 'onChange'> {
  items?: TabItem[];
  variant?: 'default' | 'pills' | 'underline';
  onChange?: (key: string) => void;
}

export function Tabs({
  items = [],
  variant = 'default',
  className,
  ...props
}: TabsProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);

  const tabListStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-sm)',
  };

  if (variant === 'pills') {
    return (
      <AntTabs
        items={items}
        onChange={props.onChange}
        className={cn('tabs tabs--pills', className)}
        tabBarStyle={tabListStyle}
        popupClassName={isDark ? 'tabs-dropdown--dark' : ''}
        {...props}
      />
    );
  }

  if (variant === 'underline') {
    return (
      <AntTabs
        items={items}
        onChange={props.onChange}
        className={cn('tabs tabs--underline', className)}
        tabBarStyle={{
          ...tabListStyle,
          borderBottom: `2px solid ${isDark ? '#334155' : '#E2E8F0'}`,
        }}
        popupClassName={isDark ? 'tabs-dropdown--dark' : ''}
        {...props}
      />
    );
  }

  return (
    <AntTabs
      items={items}
      onChange={props.onChange}
      className={cn('tabs', className)}
      tabBarStyle={tabListStyle}
      popupClassName={isDark ? 'tabs-dropdown--dark' : ''}
      {...props}
    />
  );
}

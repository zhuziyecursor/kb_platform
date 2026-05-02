'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ConfigProvider, App, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'system',
  setThemeMode: () => {},
  resolvedTheme: 'light',
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem('themeMode');
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

const FONT_FAMILY = `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`;

const lightTokens = {
  colorPrimary: '#475569',
  colorInfo: '#2563EB',
  colorSuccess: '#16A34A',
  colorWarning: '#D97706',
  colorError: '#DC2626',
  colorTextBase: '#1E293B',
  colorBgBase: '#FFFFFF',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  colorBgLayout: '#F8FAFC',
  colorBorder: '#E2E8F0',
  colorBorderSecondary: '#E2E8F0',
  colorText: '#1E293B',
  colorTextSecondary: '#64748B',
  colorTextTertiary: '#94A3B8',
  colorTextQuaternary: '#CBD5E1',
  colorFill: '#EAEFF3',
  colorFillSecondary: '#F1F5F9',
  colorFillTertiary: '#F8FAFC',
  colorFillQuaternary: '#FFFFFF',
  colorBgSpotlight: '#1E293B',
  colorBgMask: 'rgba(15, 23, 42, 0.45)',
};

const darkTokens = {
  colorPrimary: '#64748B',
  colorInfo: '#3B82F6',
  colorSuccess: '#22C55E',
  colorWarning: '#F59E0B',
  colorError: '#EF4444',
  colorTextBase: '#E2E8F0',
  colorBgBase: '#0F172A',
  colorBgContainer: '#1E293B',
  colorBgElevated: '#1E293B',
  colorBgLayout: '#0F172A',
  colorBorder: '#334155',
  colorBorderSecondary: '#334155',
  colorText: '#E2E8F0',
  colorTextSecondary: '#94A3B8',
  colorTextTertiary: '#64748B',
  colorTextQuaternary: '#475569',
  colorFill: '#1E293B',
  colorFillSecondary: '#1E293B',
  colorFillTertiary: '#0F172A',
  colorFillQuaternary: '#0F172A',
  colorBgSpotlight: '#475569',
  colorBgMask: 'rgba(0, 0, 0, 0.6)',
};

const sharedTokens = {
  fontFamily: FONT_FAMILY,
  fontSize: 15,
  fontSizeHeading1: 30,
  fontSizeHeading2: 24,
  fontSizeHeading3: 20,
  fontSizeHeading4: 17,
  fontSizeHeading5: 15,
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,
  borderRadiusXS: 4,
  lineHeight: 1.6,
  controlHeight: 36,
  controlHeightLG: 44,
  controlHeightSM: 28,
  paddingContentHorizontal: 16,
  paddingContentVertical: 12,
  boxShadow:
    '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.06)',
  boxShadowSecondary:
    '0 8px 24px rgba(0,0,0,0.08)',
  motionDurationMid: '0.25s',
  motionDurationSlow: '0.35s',
  motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

const sharedComponents = {
  Table: {
    headerBorderRadius: 8,
    cellPaddingBlock: 12,
    cellPaddingInline: 16,
  },
  Card: {
    paddingLG: 24,
    borderRadiusLG: 12,
  },
  Button: {
    borderRadius: 8,
    controlHeight: 36,
    controlHeightLG: 44,
    primaryShadow: 'none',
    fontWeight: 600,
  },
  Tag: {
    borderRadiusSM: 4,
  },
  Menu: {
    itemBorderRadius: 8,
    itemMarginInline: 8,
    itemHeight: 40,
  },
  Input: {
    borderRadius: 8,
    controlHeight: 36,
    paddingInline: 12,
  },
  Select: {
    borderRadius: 8,
    controlHeight: 36,
  },
  Modal: {
    borderRadiusLG: 12,
    paddingContentHorizontalLG: 24,
    paddingMD: 20,
  },
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('themeMode', mode);
  }, []);

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeModeState(stored);
    setResolvedTheme(resolveTheme(stored));
  }, []);

  useEffect(() => {
    if (themeMode !== 'system') {
      setResolvedTheme(themeMode);
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setResolvedTheme(mq.matches ? 'dark' : 'light');
    setResolvedTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const colorTokens = resolvedTheme === 'dark' ? darkTokens : lightTokens;

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, resolvedTheme }}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: resolvedTheme === 'dark' ? theme.darkAlgorithm : undefined,
          token: {
            ...sharedTokens,
            ...colorTokens,
          },
          components: {
            ...sharedComponents,
            Table: {
              ...sharedComponents.Table,
              headerBg: resolvedTheme === 'dark' ? '#1E293B' : '#F8FAFC',
              headerColor: resolvedTheme === 'dark' ? '#E2E8F0' : '#475569',
              rowHoverBg: resolvedTheme === 'dark' ? 'rgba(59,130,246,0.06)' : 'rgba(37,99,235,0.04)',
            },
            Card: {
              ...sharedComponents.Card,
              boxShadow: resolvedTheme === 'dark'
                ? '0 4px 12px rgba(0,0,0,0.3)'
                : '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.06)',
            },
          },
        }}
      >
        <App>
          {children}
        </App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

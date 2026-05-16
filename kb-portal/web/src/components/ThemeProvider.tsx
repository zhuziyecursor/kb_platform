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
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('themeMode');
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'dark';            // shadcn / iAudit-style default
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

const FONT_FAMILY = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`;

// Light tokens — synced with globals.css :root vars
const lightTokens = {
  colorPrimary: '#2F6FEB',
  colorInfo: '#2F6FEB',
  colorSuccess: '#15803D',
  colorWarning: '#A16207',
  colorError: '#B91C1C',
  colorTextBase: '#1F2328',
  colorBgBase: '#FFFFFF',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  colorBgLayout: '#FAFAF9',
  colorBorder: '#ECEEF0',
  colorBorderSecondary: '#ECEEF0',
  colorText: '#1F2328',
  colorTextSecondary: '#6B7280',
  colorTextTertiary: '#9CA3AF',
  colorTextQuaternary: '#D1D5DB',
  colorFill: '#F2F3F5',
  colorFillSecondary: '#F6F7F9',
  colorFillTertiary: '#FAFAF9',
  colorFillQuaternary: '#FFFFFF',
  colorBgSpotlight: '#1F2328',
  colorBgMask: 'rgba(15, 23, 42, 0.4)',
};

// Dark tokens — synced with globals.css [data-theme='dark']
const darkTokens = {
  colorPrimary: '#6FA8FF',
  colorInfo: '#6FA8FF',
  colorSuccess: '#4ADE80',
  colorWarning: '#FBBF24',
  colorError: '#F87171',
  colorTextBase: '#E5E7EB',
  colorBgBase: '#0B0D10',
  colorBgContainer: '#14171A',
  colorBgElevated: '#1A1D21',
  colorBgLayout: '#0B0D10',
  colorBorder: '#232629',
  colorBorderSecondary: '#1A1D21',
  colorText: '#E5E7EB',
  colorTextSecondary: '#9CA3AF',
  colorTextTertiary: '#6B7280',
  colorTextQuaternary: '#4B5563',
  colorFill: '#1A1D21',
  colorFillSecondary: '#14171A',
  colorFillTertiary: '#0F1114',
  colorFillQuaternary: '#0B0D10',
  colorBgSpotlight: '#E5E7EB',
  colorBgMask: 'rgba(0, 0, 0, 0.7)',
};

const sharedTokens = {
  fontFamily: FONT_FAMILY,
  fontSize: 14,                   // shadcn baseline (was 15)
  fontSizeHeading1: 30,
  fontSizeHeading2: 24,
  fontSizeHeading3: 18,
  fontSizeHeading4: 16,
  fontSizeHeading5: 14,
  borderRadius: 8,
  borderRadiusLG: 16,             // unified to 16
  borderRadiusSM: 6,
  borderRadiusXS: 4,
  lineHeight: 1.55,               // tighter line-height (was 1.6)
  controlHeight: 34,              // shadcn 9*4=36; we go 34 for slight density
  controlHeightLG: 40,
  controlHeightSM: 28,
  paddingContentHorizontal: 16,
  paddingContentVertical: 10,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  boxShadowSecondary: '0 4px 16px rgba(0,0,0,0.06)',
  motionDurationMid: '0.18s',     // snappier (was 0.25s)
  motionDurationSlow: '0.28s',
  motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  wireframe: false,
};

const sharedComponents = {
  Table: {
    headerBorderRadius: 0,
    cellPaddingBlock: 10,         // tighter rows
    cellPaddingInline: 14,
    headerSplitColor: 'transparent',
    borderColor: 'transparent',   // de-Antd-ify: kill vertical lines
  },
  Card: {
    paddingLG: 20,
    borderRadiusLG: 16,
  },
  Button: {
    borderRadius: 8,
    controlHeight: 34,
    controlHeightLG: 40,
    primaryShadow: 'none',
    defaultShadow: 'none',
    dangerShadow: 'none',
    fontWeight: 500,              // shadcn uses 500 not 600
  },
  Tag: {
    borderRadiusSM: 6,
  },
  Menu: {
    itemBorderRadius: 8,
    itemMarginInline: 6,
    itemHeight: 36,
    itemPaddingInline: 12,
  },
  Input: {
    borderRadius: 8,
    controlHeight: 34,
    paddingInline: 12,
    activeShadow: '0 0 0 3px rgba(47, 111, 235, 0.12)',
  },
  Select: {
    borderRadius: 8,
    controlHeight: 34,
  },
  Modal: {
    borderRadiusLG: 16,
    paddingContentHorizontalLG: 24,
    paddingMD: 20,
    titleFontSize: 16,
    headerBg: 'transparent',
  },
  Drawer: {
    borderRadiusLG: 0,
    paddingLG: 24,
  },
  Message: {
    contentBg: 'var(--color-surface)',
    contentPadding: '10px 14px',
    borderRadiusLG: 12,
  },
  Notification: {
    borderRadiusLG: 12,
  },
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

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
              // De-Antd-ify: subtle header, no fills, soft hover
              headerBg: 'transparent',
              headerColor: resolvedTheme === 'dark' ? '#9CA3AF' : '#6B7280',
              rowHoverBg: resolvedTheme === 'dark' ? '#1A1D21' : '#F2F3F5',
            },
            Card: {
              ...sharedComponents.Card,
              boxShadow: 'none',
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

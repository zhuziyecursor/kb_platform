import type { Metadata } from "next";
import { ConfigProvider, App } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import React from "react";

export const metadata: Metadata = {
  title: "企业AI知识库管理门户",
  description: "企业AI知识库MVP实施平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#f0f2f5' }}>
        <ConfigProvider locale={zhCN}>
          <App>
            {children}
          </App>
        </ConfigProvider>
      </body>
    </html>
  );
}

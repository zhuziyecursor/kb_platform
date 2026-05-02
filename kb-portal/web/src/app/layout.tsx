import type { Metadata } from "next";
import React from "react";
import ThemeProvider from "@/components/ThemeProvider";
import './globals.css';

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
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

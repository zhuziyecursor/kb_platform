import type { Metadata } from "next";
import React from "react";
import ThemeProvider from "@/components/ThemeProvider";
import './globals.css';

export const metadata: Metadata = {
  title: "知识智库管理门户",
  description: "知识智库MVP实施平台",
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

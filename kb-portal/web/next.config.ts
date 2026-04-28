import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  eslint: {
    // ESLint 在开发时运行，默认关闭以加快构建
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

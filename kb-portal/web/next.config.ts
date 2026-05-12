import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [
      { source: '/rag/v1/:path*', destination: 'http://localhost:31005/rag/v1/:path*' },
      { source: '/kb/v1/:path*', destination: 'http://localhost:8081/kb/v1/:path*' },
    ];
  },
};

export default nextConfig;

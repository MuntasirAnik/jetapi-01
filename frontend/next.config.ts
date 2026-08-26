import type { NextConfig } from "next";

const BACKEND_URL = process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'react-toastify'],
  },
  // Compress static assets
  compress: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

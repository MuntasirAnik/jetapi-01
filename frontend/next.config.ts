import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'react-toastify'],
  },
  // Compress static assets
  compress: true,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Raise body size limit for large export payloads (many tracks from long videos)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // Allow loading models from public folder with caching
  async headers() {
    return [
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
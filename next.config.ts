import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Empty turbopack config silences the webpack/turbopack conflict error
  // Hot reload in Docker is handled via WATCHPACK_POLLING env var in docker-compose.dev.yml
  turbopack: {},

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

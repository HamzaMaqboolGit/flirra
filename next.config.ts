import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep `next build` output from replacing assets used by a live dev server.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  turbopack: { root: process.cwd() },
};

export default nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep `next build` output from replacing assets used by a live dev server.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  turbopack: { root: process.cwd() },
  // Hostinger Web App Hosting provides a constrained process/thread budget.
  // Keep page-data collection deterministic and avoid worker-thread fan-out.
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;

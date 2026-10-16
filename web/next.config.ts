import type { NextConfig } from 'next';
const config: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  output: 'export',
  images: { unoptimized: true },
  turbopack: { root: process.cwd() },
};
export default config;

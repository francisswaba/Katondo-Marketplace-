import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  experimental: {
    // The stylesheet is small; building it into each page removes a render-blocking request.
    inlineCss: true,
  },
};

export default nextConfig;

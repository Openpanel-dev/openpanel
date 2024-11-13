import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: false,
  images: {
    domains: ['localhost', 'openpanel.dev'],
  },
  // experimental: {
  //   ppr: 'incremental', // does not work with hyperdx?!
  // },
  transpilePackages: [
    '@openpanel/queue',
    '@openpanel/db',
    '@openpanel/common',
    '@openpanel/constants',
    '@openpanel/redis',
    '@openpanel/validation',
  ],
  serverExternalPackages: ['@hyperdx/node-opentelemetry', 'ioredis', 'bullmq'],
};

export default withMDX(config);

import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: false,
  images: {
    domains: ['localhost', 'openpanel.dev', 'api.openpanel.dev'],
  },
  serverExternalPackages: ['@hyperdx/node-opentelemetry'],
};

export default withMDX(config);

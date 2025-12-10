import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: false,
  images: {
    domains: ['localhost', 'openpanel.dev', 'api.openpanel.dev'],
  },
  serverExternalPackages: ['@hyperdx/node-opentelemetry', '@openpanel/geo'],
  redirects: [
    {
      source: '/articles/top-7-open-source-web-analytics-tools',
      destination: '/articles/open-source-web-analytics',
      permanent: true,
    },
  ],
};

export default withMDX(config);

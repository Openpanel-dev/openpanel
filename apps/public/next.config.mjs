import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: false,
  images: {
    unoptimized: true,
    domains: ['localhost', 'openpanel.dev', 'api.openpanel.dev'],
  },
  serverExternalPackages: ['@hyperdx/node-opentelemetry', '@openpanel/geo', 'shiki'],
  redirects: [
    {
      source: '/articles/top-7-open-source-web-analytics-tools',
      destination: '/articles/self-hosted-web-analytics',
      permanent: true,
    },
    {
      source: '/articles/alternatives-to-mixpanel',
      destination: '/articles/mixpanel-alternatives',
      permanent: true,
    },
    {
      source: '/articles/vs-mixpanel',
      destination: '/compare/mixpanel-alternative',
      permanent: true,
    },
    {
      source: '/articles/open-source-web-analytics',
      destination: '/articles/self-hosted-web-analytics',
      permanent: true,
    },
    {
      source: '/open-source-analytics',
      destination: '/articles/self-hosted-web-analytics',
      permanent: true,
    },
  ],
};

export default withMDX(config);

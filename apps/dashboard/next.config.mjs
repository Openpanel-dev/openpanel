// @ts-expect-error
import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

/** @type {import("next").NextConfig} */
const config = {
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }

    return config;
  },
  reactStrictMode: true,
  transpilePackages: [
    '@openpanel/queue',
    '@openpanel/db',
    '@openpanel/common',
    '@openpanel/constants',
    '@openpanel/redis',
    '@openpanel/validation',
    '@openpanel/email',
  ],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Avoid "Critical dependency: the request of a dependency is an expression"
    serverComponentsExternalPackages: [
      'bullmq',
      'ioredis',
      '@hyperdx/node-opentelemetry',
      '@node-rs/argon2',
    ],
    instrumentationHook: !!process.env.ENABLE_INSTRUMENTATION_HOOK,
  },
  /**
   * If you are using `appDir` then you must comment the below `i18n` config out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ['en'],
    defaultLocale: 'en',
  },
};

export default config;

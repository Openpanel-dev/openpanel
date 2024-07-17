// @ts-expect-error
import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import('./src/env.mjs');

/** @type {import("next").NextConfig} */
const config = {
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
  ],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Avoid "Critical dependency: the request of a dependency is an expression"
    serverComponentsExternalPackages: ['bullmq', 'ioredis'],
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

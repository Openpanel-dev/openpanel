import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * `apps/start` keeps vitest (ADR-010: "vitest stays for apps/start") and its
 * own `vitest ^3.0.5` devDependency. This file exists so it keeps it on its own
 * terms: without a vitest config, vitest loads `vite.config.ts`, whose
 * Cloudflare / TanStack Start / Sentry plugin chain is a dev-server and build
 * pipeline that a unit test has no use for.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

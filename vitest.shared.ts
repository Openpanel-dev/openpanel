import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

// Absolute path to the root test-setup — used as setupFiles so every package
// gets connection-pool cleanup without needing a per-package file.
const rootTestSetup = (dirname: string) => path.resolve(dirname, '../../test/test-setup.ts');

export const getSharedVitestConfig = ({
  __dirname: dirname,
}: {
  __dirname: string;
}) => {
  return defineConfig({
    resolve: {
      alias: {
        '@': path.resolve(dirname, 'src'),
      },
    },
    test: {
      setupFiles: [rootTestSetup(dirname)],
      env: {
        // Always point at local Docker — never production, regardless of .env
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public',
        CLICKHOUSE_URL: 'http://localhost:8123/openpanel',
        REDIS_URL: 'redis://localhost:6379',
        SELF_HOSTED: 'true',
      },
      include: ['**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      browser: {
        name: 'chromium',
        provider: 'playwright',
        headless: true,
      },
      fakeTimers: { toFake: undefined },
    },
  });
};

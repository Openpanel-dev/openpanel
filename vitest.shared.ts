import * as path from 'node:path';
import { defineConfig } from 'vitest/config';
import {
  TEST_CLICKHOUSE_URL,
  TEST_DATABASE_URL,
  TEST_REDIS_URL,
} from './test/databases';

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
        // Always point at the local, ISOLATED test databases — never
        // production, and never the application's own databases, regardless
        // of .env. See test/databases.ts.
        DATABASE_URL: TEST_DATABASE_URL,
        CLICKHOUSE_URL: TEST_CLICKHOUSE_URL,
        REDIS_URL: TEST_REDIS_URL,
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

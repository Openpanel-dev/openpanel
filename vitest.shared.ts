import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

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
      env: {
        // Always point at local Docker — never production, regardless of .env
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
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

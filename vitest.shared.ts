import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

export const getSharedVitestConfig = ({
  __dirname: dirname,
}: { __dirname: string }) => {
  return defineConfig({
    resolve: {
      alias: {
        '@': path.resolve(dirname, 'src'),
      },
    },
    test: {
      env: {
        // Not used, just so prisma is happy
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
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

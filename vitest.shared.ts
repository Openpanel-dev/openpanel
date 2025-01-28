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

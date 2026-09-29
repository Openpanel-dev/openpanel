import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Nested under packages/sdks — go up three levels to the repo test setup.
    setupFiles: [path.resolve(__dirname, '../../../test/test-setup.ts')],
    include: ['**/*.test.ts'],
  },
});

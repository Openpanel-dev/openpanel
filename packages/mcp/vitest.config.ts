import { mergeConfig } from 'vitest/config';
import { getSharedVitestConfig } from '../../vitest.shared';

export default mergeConfig(getSharedVitestConfig({ __dirname }), {
  test: {
    // Closes the ClickHouse keep-alive connection pool after every test file
    // so the worker thread can exit without hanging.
    setupFiles: ['./src/test-setup.ts'],
  },
});

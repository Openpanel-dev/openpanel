import { defineConfig } from 'vitest/config';

// core's tests are bun:test (ADR-010) and vitest cannot import 'bun:test'.
// The root vitest workspace globs `packages/*`, so this package opts itself
// out here rather than at the root. Run them with `bun test --isolate`.
export default defineConfig({
  test: { include: [] },
});

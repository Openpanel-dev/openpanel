import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm'],
  // Inline @openpanel/validation types into the bundled .d.ts so consumers
  // don't see `import type { … } from '@openpanel/validation'` (the
  // package is workspace-internal and not published).
  dts: { resolve: [/^@openpanel\//] },
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
});

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm'],
  // Inline @openpanel/core's constants types into the bundled .d.ts so
  // consumers don't see an `import type { … }` of a workspace-internal,
  // unpublished package.
  dts: { resolve: [/^@openpanel\//] },
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
});

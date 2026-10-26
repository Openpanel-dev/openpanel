import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm'],
  dts: { resolve: [/^@openpanel\//] },
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
});

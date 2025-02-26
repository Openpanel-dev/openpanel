import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts', 'src/tracker.ts'],
  format: ['cjs', 'esm', 'iife'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
});

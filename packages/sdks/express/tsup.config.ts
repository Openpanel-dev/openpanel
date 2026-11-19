import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts', 'cdn.ts'],
  format: ['cjs', 'esm', 'iife'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
});

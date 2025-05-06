import { defineConfig } from 'tsup';

export default defineConfig({
  format: ['cjs', 'esm'],
  entry: ['index.tsx', 'server.ts'],
  external: ['react', 'next'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
});

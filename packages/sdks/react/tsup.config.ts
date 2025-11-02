import { defineConfig } from 'tsup';

export default defineConfig({
  format: ['cjs', 'esm'],
  entry: ['index.tsx'],
  external: ['react', 'react-dom'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
});

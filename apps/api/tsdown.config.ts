import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const options: Options = {
  clean: true,
  entry: ['src/index.ts'],
  noExternal: [/^@openpanel\/.*$/u, /^@\/.*$/u],
  external: ['@hyperdx/node-opentelemetry', 'winston', '@node-rs/argon2'],
  sourcemap: true,
  platform: 'node',
  shims: true,
  inputOptions: {
    jsx: 'react',
  },
};

if (process.env.WATCH) {
  options.watch = ['src', '../../packages'];
  options.onSuccess = 'node --enable-source-maps dist/index.js';
  options.minify = false;
}

export default defineConfig(options);

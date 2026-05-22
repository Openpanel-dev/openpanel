import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const options: Options = {
  clean: true,
  entry: ['src/index.ts'],
  noExternal: [/^@openpanel\/.*$/u, /^@\/.*$/u],
  external: [
    '@hyperdx/node-opentelemetry',
    'pino',
    'pino-pretty',
    '@node-rs/argon2',
    // @platformatic/wasm-utils does readFileSync('./native.wasm') at import
    // time; bundling breaks the relative path lookup. Keep the whole
    // @platformatic/* family external so it resolves from node_modules.
    /^@platformatic\//u,
  ],
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

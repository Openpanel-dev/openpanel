import type { Options } from 'tsdown';
import { defineConfig } from 'tsdown';

const options: Options = {
  clean: true,
  entry: ['src/index.ts'],
  noExternal: [/^@openpanel\/.*$/u, /^@\/.*$/u],
  external: [
    '@hyperdx/node-opentelemetry',
    'pino',
    'pino-pretty',
    '@node-rs/argon2',
    // object-store adapter SDKs, now in @openpanel/core
    '@aws-sdk/client-s3',
    '@aws-sdk/client-sts',
    '@google-cloud/storage',
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

import { defineConfig } from 'tsup';
import type { Options } from 'tsup';

const options: Options = {
  clean: true,
  entry: ['src/index.ts'],
  noExternal: [/^@openpanel\/.*$/u, /^@\/.*$/u],
  external: [
    '@hyperdx/node-opentelemetry',
    'winston',
    '@node-rs/argon2',
    'bcrypt',
  ],
  ignoreWatch: ['../../**/{.git,node_modules,dist}/**'],
  sourcemap: true,
  splitting: false,
};

if (process.env.WATCH) {
  options.watch = ['src/**/*', '../../packages/**/*'];

  options.onSuccess = 'node dist/index.js';
  options.minify = false;
}

export default defineConfig(options);

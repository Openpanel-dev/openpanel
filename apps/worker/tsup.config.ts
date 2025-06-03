import { defineConfig } from 'tsup';
import type { Options } from 'tsup';

const options: Options = {
  clean: true,
  entry: ['src/index.ts'],
  noExternal: [/^@openpanel\/.*$/u, /^@\/.*$/u],
  external: ['@hyperdx/node-opentelemetry', 'winston'],
  ignoreWatch: ['../../**/{.git,node_modules,dist}/**'],
  sourcemap: true,
  splitting: false,
};

if (process.env.WATCH) {
  options.watch = ['src/**/*', '../../packages/**/*'];
  options.onSuccess = 'node dist/index.js';
}

export default defineConfig(options);

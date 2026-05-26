import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const sdkPkg = JSON.parse(readFileSync('../sdk/package.json', 'utf-8'));

export default defineConfig({
  entry: ['index.ts', 'src/tracker.ts'],
  format: ['cjs', 'esm', 'iife'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,
  // Bundle rrweb + all @openpanel workspace deps into the output so the
  // distributed SDK is self-contained — consumers install only @openpanel/web,
  // and the IIFE script-tag build resolves without bare-module specifiers.
  noExternal: ['rrweb', /^@openpanel\//],
  // Inline version constants so `process.env.*` references don't blow up in
  // the browser. tsup leaves process.env.X as-is otherwise.
  define: {
    'process.env.WEB_VERSION': JSON.stringify(pkg.version),
    'process.env.SDK_VERSION': JSON.stringify(sdkPkg.version),
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.LANG': JSON.stringify(''),
  },
  platform: 'browser',
});

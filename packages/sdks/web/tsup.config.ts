import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build (npm package) — cjs + esm + dts
  // Dynamic import('./replay') is preserved; the host app's bundler
  // will code-split it into a separate chunk automatically.
  {
    entry: ['index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    minify: true,
  },
  // IIFE build (script tag: op1.js)
  // __OPENPANEL_REPLAY_URL__ is injected at build time so the IIFE
  // knows to load the replay module from the CDN instead of a
  // relative import (which doesn't work in a standalone script).
  // The replay module is excluded via an esbuild plugin so it is
  // never bundled into op1.js — it will be loaded lazily via <script>.
  {
    entry: { 'src/tracker': 'src/tracker.ts' },
    format: ['iife'],
    splitting: false,
    sourcemap: false,
    minify: true,
    define: {
      __OPENPANEL_REPLAY_URL__: JSON.stringify(
        'https://openpanel.dev/op1-replay.js'
      ),
    },
    esbuildPlugins: [
      {
        name: 'exclude-replay-from-iife',
        setup(build) {
          // Intercept any import that resolves to the replay module and
          // return an empty object. The actual loading happens at runtime
          // via a <script> tag (see loadReplayModule in index.ts).
          build.onResolve(
            { filter: /[/\\]replay([/\\]index)?(\.[jt]s)?$/ },
            () => ({
              path: 'replay-empty-stub',
              namespace: 'replay-stub',
            })
          );
          build.onLoad({ filter: /.*/, namespace: 'replay-stub' }, () => ({
            contents: 'module.exports = {}',
            loader: 'js',
          }));
        },
      },
    ],
  },
  // Replay module — built as both ESM (npm) and IIFE (CDN).
  // ESM  → consumed by the host-app's bundler via `import('./replay')`.
  // IIFE → loaded at runtime via a classic <script> tag (no CORS issues).
  //        Exposes `window.__openpanel_replay`.
  // rrweb must be bundled in (noExternal) because browsers can't resolve
  // bare specifiers like "rrweb" from a standalone ES module / script.
  {
    entry: { 'src/replay': 'src/replay/index.ts' },
    format: ['esm', 'iife'],
    globalName: '__openpanel_replay',
    splitting: false,
    sourcemap: false,
    minify: true,
    noExternal: ['rrweb', '@rrweb/types'],
  },
]);

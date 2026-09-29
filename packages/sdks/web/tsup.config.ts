import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build (npm package) — cjs + esm + dts.
  // Does not import `./replay`; consumers that want session replay import
  // `@openpanel/web/replay` and pass `startReplayRecorder` as
  // `sessionReplay.recorder`, so rrweb stays out of lean bundles.
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
  },
  // Replay module — built as both ESM (npm subpath) and IIFE (CDN).
  // ESM  → `@openpanel/web/replay`
  // IIFE → loaded at runtime via a classic <script> tag (no CORS issues).
  //        Exposes `window.__openpanel_replay`.
  // rrweb must be bundled in (noExternal) because browsers can't resolve
  // bare specifiers like "rrweb" from a standalone ES module / script.
  {
    entry: { 'src/replay': 'src/replay/index.ts' },
    format: ['esm', 'iife'],
    dts: true,
    globalName: '__openpanel_replay',
    splitting: false,
    sourcemap: false,
    minify: true,
    noExternal: ['rrweb', '@rrweb/types'],
  },
]);

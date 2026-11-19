'use strict';
/**
 * Architecture enforcement: constants stay isomorphic, layers only import downward, web bundles never reach
 * server code. Rules, in order below:
 *  - core-uses-ctx-not-db-internals: packages/core reaches Postgres/ClickHouse through ctx.db / ctx.ch.
 *  - core-no-self-barrel: a file under packages/core/src imports its siblings relatively, never via @openpanel/core.
 *  - core-layers-*: one rule per layer boundary.
 *  - constants-stay-isomorphic: a `*.constants.ts` file depends on nothing but zod, another constants file or a
 *    type-only specifier.
 *  - frontend-values-only-constants: a web app (apps/start, apps/public, packages/sdks/*) may only VALUE-import
 *    @openpanel/core or @openpanel/db through a `*.constants.ts` path.
 *  - shared-root-stays-isomorphic: nothing reachable from @openpanel/shared's root imports a node: builtin or server/.
 *  - no-web-to-server: a web app may not import @openpanel/shared/server.
 *
 * Do NOT set `options.exclude: { path: 'node_modules' }`: it drops every npm dependency before the rules run, so
 * constants-stay-isomorphic would only catch builtins. The zod allow-list entry matches the RESOLVED path, not
 * the bare specifier, because `path` conditions match against `resolved`.
 *
 * `check:deps` runs the declared `dependency-cruiser` devDependency, not `bunx`: it classifies an edge as
 * type-only only when it can load `typescript` from its own directory, and under `bunx` it could not, producing
 * false `core-uses-ctx-not-db-internals` violations on every `import type`. bun's isolated linker keeps the store
 * inside the repo, so the lookup reaches the root `node_modules/typescript`.
 */
// Layers only import downward. The order, lowest first:
//
//   shared < clients < transport infrastructure (rpc/, http/, jobs/)
//          < modules < services.ts < registries < index.ts
//
// It is a LAYER order, not path depth: a module importing `../../jobs/define` is going DOWN. rpc/, http/ and jobs/ are ONE
// layer, so edges among them are sideways, as are cross-module edges. A dependency-cruiser rule covers one
// from-by-to rectangle while "every layer may import every lower layer" is a triangle, hence one rule per
// layer boundary. All six share the `core-layers-` prefix and this comment.
const LAYERS_COMMENT =
  'Layers only import downward: shared < clients < transport infrastructure ' +
  '(rpc/, http/, jobs/) < modules < services.ts < registries < index.ts. By ' +
  'layer, not by path depth: a module importing ../../jobs/define is going ' +
  'down, and rpc/ http/ jobs/ are one layer so edges among them are sideways. ' +
  "Infrastructure reaches a module's behaviour through deps/ctx, never by " +
  'deep-importing modules/<name>/src/*. Two upward edges are legal, both on ' +
  'core-layers-modules-below-composition: a type-only import of ServiceDeps / ' +
  'Services from services.ts (every service factory takes both), and a value ' +
  "import of another module's <name>.constants.ts. An upward import couples a " +
  'lower layer to code that is built from it, which is how import cycles and ' +
  'a junk-drawer shared/ start; move the code to the layer that owns it ' +
  'instead.';

// The web tier: everything that ends up in a browser bundle.
const FRONTENDS = '^(apps/(start|public)|packages/sdks/)';

// The composition root and everything above it.
const COMPOSITION_AND_ABOVE =
  '^packages/core/src/(services|rpc\\.router|rest\\.routes|jobs\\.registry|index)\\.ts$';
// The five registries minus services.ts, plus the export surface.
const REGISTRIES_AND_INDEX =
  '^packages/core/src/(rpc\\.router|rest\\.routes|jobs\\.registry|index)\\.ts$';
// Directory layers strictly above shared, and strictly above clients.
const ABOVE_SHARED = '^packages/core/src/(clients|rpc|http|jobs|modules)/';
const ABOVE_CLIENTS = '^packages/core/src/(rpc|http|jobs|modules)/';

module.exports = {
  forbidden: [
    {
      name: 'core-uses-ctx-not-db-internals',
      severity: 'error',
      comment:
        'packages/core reaches Postgres and ClickHouse through ctx.db / ctx.ch / ' +
        'ServiceDeps, never by acquiring a client from @openpanel/db itself, so the ' +
        'requestId minted at the edge stays on every query. `import type` is allowed, ' +
        'which keeps `bun test` offline. Exempt FROM: packages/core/src/context.ts, whose ' +
        "Db / ClickHouseClient fields are `typeof import('@openpanel/db/...')` type " +
        'queries that dependency-cruiser does not tag as type-only (exempting the ' +
        'type-import tag instead would also hide runtime `import()` of the same module, ' +
        'because both fold into one edge); and *.test.ts, since a test has no request ' +
        'and some tests deliberately compare core against the real @openpanel/db ' +
        'helpers. Exempt TO: the three files that build query text and hold no client ' +
        '(clickhouse/sql.ts, clickhouse/query-builder.ts, sql-builder.ts); the client is ' +
        'still whatever the caller passes, which in core is always deps.ch. ' +
        'prisma-client.ts, clickhouse/client.ts, logger.ts and the barrel are not exempt: ' +
        'those are where a second client comes from.',
      from: {
        path: '^packages/core/src/',
        pathNot: ['^packages/core/src/context\\.ts$', '\\.test\\.ts$'],
      },
      to: {
        path: '^packages/db/',
        pathNot: [
          '^packages/db/src/clickhouse/sql\\.ts$',
          '^packages/db/src/clickhouse/query-builder\\.ts$',
          '^packages/db/src/sql-builder\\.ts$',
        ],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-no-self-barrel',
      severity: 'error',
      comment:
        'A file under packages/core/src imports its siblings by relative path, never ' +
        'through its own barrel (@openpanel/core): a relative import always works, and ' +
        'going through the barrel reintroduces the resolution cycles the barrel exists ' +
        "to keep away from external consumers. `to.path` is the barrel's resolved file " +
        '(src/index.ts), because rules match resolved paths, not specifiers. `import ' +
        'type` is allowed. *.test.ts is exempt: a barrel test has to import the barrel, ' +
        "and `mock.module('@openpanel/core', ...)` is a mocking idiom, not a cycle.",
      from: {
        path: '^packages/core/src/',
        pathNot: '\\.test\\.ts$',
      },
      to: {
        path: '^packages/core/src/index\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-layers-shared-is-the-bottom',
      severity: 'error',
      comment: LAYERS_COMMENT,
      from: {
        path: '^packages/core/src/shared/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: [ABOVE_SHARED, COMPOSITION_AND_ABOVE] },
    },
    {
      name: 'core-layers-clients-below-transport',
      severity: 'error',
      comment: LAYERS_COMMENT,
      from: {
        path: '^packages/core/src/clients/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: [ABOVE_CLIENTS, COMPOSITION_AND_ABOVE] },
    },
    {
      name: 'core-layers-transport-below-modules',
      severity: 'error',
      comment: LAYERS_COMMENT,
      from: {
        // One layer, three directories: rpc/base.ts, http/define.ts and
        // jobs/define.ts are peers, so edges AMONG them are sideways, not up.
        path: '^packages/core/src/(rpc|http|jobs)/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: ['^packages/core/src/modules/', COMPOSITION_AND_ABOVE] },
    },
    {
      name: 'core-layers-modules-below-composition',
      severity: 'error',
      comment: LAYERS_COMMENT,
      from: {
        path: '^packages/core/src/modules/',
        pathNot: '\\.test\\.ts$',
      },
      to: {
        path: COMPOSITION_AND_ABOVE,
        // `<name>.constants.ts` is the one file that may be imported as a VALUE across a boundary.
        pathNot: '\\.constants\\.ts$',
        // Every service factory takes `(deps: ServiceDeps, services: () => Services)`, both names from services.ts: those imports must stay type-only.
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-layers-composition-below-registries',
      severity: 'error',
      comment: LAYERS_COMMENT,
      from: { path: '^packages/core/src/services\\.ts$' },
      to: { path: REGISTRIES_AND_INDEX, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'core-layers-registries-below-index',
      severity: 'error',
      comment: LAYERS_COMMENT,
      from: {
        path: '^packages/core/src/(rpc\\.router|rest\\.routes|jobs\\.registry)\\.ts$',
      },
      to: {
        path: '^packages/core/src/index\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'constants-stay-isomorphic',
      severity: 'error',
      comment:
        'A *.constants.ts file must stay isomorphic: zod, another *.constants.ts, or type-only.',
      from: { path: '\\.constants\\.ts$' },
      to: {
        // zod is matched by resolved path: `^zod$` only matched the fallback dependency-cruiser uses when resolution fails.
        pathNot: ['\\.constants\\.ts$', '(^|/)node_modules/zod/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'frontend-values-only-constants',
      severity: 'error',
      comment:
        'A web app (apps/start, apps/public, packages/sdks/*) value-imports ' +
        '@openpanel/core or @openpanel/db only through a *.constants.ts path. Everything ' +
        'else must be `import type`, which is erased, so no server code reaches a browser ' +
        'bundle. @openpanel/shared is not in the TO list: its root entrypoint is meant for ' +
        'browsers, and shared-root-stays-isomorphic keeps that safe. check:deps only ' +
        'cruises apps/start and packages, so the apps/public part of this rule is not ' +
        'checked until that command names it.',
      from: { path: FRONTENDS },
      to: {
        path: '^packages/(core|db)/',
        pathNot: '\\.constants\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'shared-root-stays-isomorphic',
      severity: 'error',
      comment:
        "Nothing reachable from @openpanel/shared's root entrypoint may import a node: " +
        'builtin or the server/ subtree. A root-reachable file that imports node:crypto ' +
        'still type-checks and bundles, and puts a Node polyfill (or a broken bundle) in ' +
        'every browser that loads the dashboard, while looking isomorphic at the call ' +
        'site. Node-only code belongs behind @openpanel/shared/server. Reachability is ' +
        'computed from src/index.ts, so a helper several imports down is covered too. ' +
        'dependency-cruiser reports a node: specifier with the prefix stripped, hence the ' +
        'two spellings.',
      from: { path: '^packages/shared/src/index\\.ts$' },
      to: {
        path: [
          '^(node:)?(assert|async_hooks|buffer|child_process|cluster|crypto|dgram|dns|events|fs|http|http2|https|inspector|module|net|os|path|perf_hooks|process|querystring|readline|repl|stream|string_decoder|timers|tls|tty|url|util|v8|vm|worker_threads|zlib)(/|$)',
          '^packages/shared/src/server/',
        ],
        reachable: true,
      },
    },
    {
      name: 'no-web-to-server',
      severity: 'error',
      comment:
        'A web app may not import @openpanel/shared/server: it holds server-only helpers ' +
        '(crypto, encryption, safe-fetch, ssrf, parser-user-agent) that must not reach a ' +
        'browser bundle. The specifier itself is the violation, so no reachability is ' +
        'needed. As with frontend-values-only-constants, apps/public is not cruised by ' +
        'check:deps yet.',
      from: { path: FRONTENDS },
      to: { path: '^packages/shared/src/server/' },
    },
  ],
  options: {
    // Only stops the crawl from recursing INTO node_modules (so we don't
    // cruise zod/date-fns internals); it still leaves the edge FROM our file
    // TO the npm package in that file's dependency list, so rules still see
    // it. Do NOT add `options.exclude` here — see the header.
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};

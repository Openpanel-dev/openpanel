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
// layer, so edges among them are sideways, as are cross-module edges. A dependency-cruiser rule is one from x to
// rectangle while "every layer may import every lower layer" is a triangle, hence one rule per layer boundary.
// layer boundary. All six share the `core-layers-` prefix and this comment.
const R22_COMMENT =
  'ADR-022 R22: layers only import downward — shared < clients < transport ' +
  'infrastructure (rpc/, http/, jobs/) < modules < services.ts < registries < ' +
  'index.ts. By LAYER, not by path depth: a module importing ../../jobs/define ' +
  'is going down and is not a violation, and rpc/ http/ jobs/ are one layer so ' +
  "edges among them are sideways. Infrastructure reaches a module's behaviour " +
  'through deps/ctx, never by deep-importing modules/<name>/src/*. Two upward ' +
  'edges are legal, both type-only and both exempted on ' +
  'core-layers-modules-below-composition: a module importing ServiceDeps / ' +
  'Services from services.ts (R3 requires it — all 36 factories do it), and a ' +
  "module importing another module's <name>.constants.ts (R8 blesses that " +
  'file). Landed at `warn` by M14-002 with 23 violations (7 from shared/, 6 ' +
  'from clients/, 10 from rpc/ + http/ + jobs/, 0 from modules/ and above), ' +
  'exactly as core-uses-ctx-not-db-internals did in M10-001. M15-008 cleared ' +
  'clients/, and M15-009 cleared the rest and flipped all six rules to ' +
  '`error` at 0: shared/ stopped being a drawer (the seven misfiled files went ' +
  'to the layer that owns them), the ingest tier is handed to the clientAuth ' +
  'macro instead of imported by it, and the two registry reads moved into the ' +
  'registry. A rule that fires is the only durable fix.';

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
        'M10-001/M10-009 (docs/TECH_DEBT.md §4 steps 2 and 4): packages/core reaches ' +
        'Postgres/ClickHouse through ctx.db / ctx.ch / ServiceDeps, never by acquiring a ' +
        'client from @openpanel/db itself, so a requestId minted at the edge keeps reaching ' +
        "the query (ADR-018). import type stays allowed (dependencyTypesNot: ['type-only']) " +
        '— that is what keeps `bun test` offline. M10-009 flipped this from warn to error at ' +
        '0 violations; the four exemptions below are each a named seam, not a blanket. ' +
        'FROM: (1) packages/core/src/context.ts — its Db / ClickHouseClient fields are ' +
        "`typeof import('@openpanel/db/...')` type queries, which dependency-cruiser tags " +
        "['undetermined', 'type-import'] rather than 'type-only' (verified via --output-type " +
        'json), i.e. a genuinely type-level reference; excluded by path rather than by ' +
        'widening dependencyTypesNot, because dependency-cruiser folds a `typeof import()` ' +
        'and a runtime `import()` of the same module into ONE edge and drops the ' +
        "'dynamic-import' tag when it does, so exempting 'type-import' wholesale would hide " +
        'real value imports. (2) packages/core/src/v1-compat.ts — THE declared composition ' +
        "seam (ADR-007; that file's own header). It is where the boot scope registers the " +
        'deps it already built, and the only thing behind it is the lazy fallback for a ' +
        "caller with no Ctx to thread through — MCP's tool handlers have a fixed " +
        '@modelcontextprotocol/sdk signature (modules/mcp/src/auth.ts lazy-imports it; the gsc ' +
        'tools reach getGsc* through it), and the assistant tool runtime is the same shape. ' +
        'Nothing holding a Ctx comes through it. M11-004 corrects an earlier claim here: this ' +
        'file is NOT deleted with packages/trpc — it stays as that seam. ' +
        '(3) packages/core/src/code-migrations/** — one-shot CLI scripts run by ' +
        '`migrate.ts` (`pnpm migrate:deploy:code`), outside the app, with no request and no ' +
        'Ctx to lose; ADR-007 puts code-migrations/ in core and keeps clickhouse/migration.ts ' +
        'in packages/db, so the edge is what the ADR describes. (4) *.test.ts — a test has no ' +
        "request, and M10-009's own measurement of this drift is defined as " +
        '`grep ... | grep -v .test.ts`. Tests that need a real client against openpanel_test ' +
        'take it directly; two of them (shared/ch-tables.parity.test.ts, ' +
        "shared/ch-dates.parity.test.ts) exist precisely to police core's copies of " +
        "@openpanel/db's table map and date helpers against the originals. " +
        'TO: the three modules under packages/db that build QUERY TEXT and hold no client — ' +
        'clickhouse/sql.ts (ADR-013 fixes the `sql` tag AT that path by name), ' +
        'clickhouse/query-builder.ts (`clix(client, tz)` takes the client as an argument) and ' +
        'sql-builder.ts (`createSqlBuilder()` returns strings). Importing one of those cannot ' +
        'lose a request scope, because the client is still whatever the caller passes — and ' +
        'in core that is always deps.ch. prisma-client.ts, clickhouse/client.ts, logger.ts ' +
        'and the barrel are NOT exempt: those are where a second client comes from.',
      from: {
        path: '^packages/core/src/',
        pathNot: [
          '^packages/core/src/context\\.ts$',
          '^packages/core/src/v1-compat\\.ts$',
          '^packages/core/src/code-migrations/',
          '\\.test\\.ts$',
        ],
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
        'M10-001/M10-009 (docs/TECH_DEBT.md §4): a file under packages/core/src/** imports its ' +
        'siblings by relative path, never through its own package barrel (@openpanel/core) — a ' +
        'self-import is always resolvable as a relative import and importing the barrel instead ' +
        'just risks reintroducing the exact resolution cycles the barrel is meant to avoid for ' +
        'external consumers. `to.path` matches the RESOLVED path (see header comment), so this ' +
        'targets packages/core/package.json\'s "." export target (./src/index.ts) directly rather ' +
        'than the bare specifier string, which would never match a resolved path. import type ' +
        'stays allowed. M10-009 flipped this from warn to error at 0 violations. *.test.ts is ' +
        'exempt: a barrel test (src/index.test.ts) has to import the barrel to test it, and the ' +
        "mcp/gsc suites `mock.module('@openpanel/core', ...)` deliberately — that is a mocking " +
        'idiom, not a production import cycle.',
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
      comment: R22_COMMENT,
      from: {
        path: '^packages/core/src/shared/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: [ABOVE_SHARED, COMPOSITION_AND_ABOVE] },
    },
    {
      name: 'core-layers-clients-below-transport',
      severity: 'error',
      comment: R22_COMMENT,
      from: {
        path: '^packages/core/src/clients/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: [ABOVE_CLIENTS, COMPOSITION_AND_ABOVE] },
    },
    {
      name: 'core-layers-transport-below-modules',
      severity: 'error',
      comment: R22_COMMENT,
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
      comment: R22_COMMENT,
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
      comment: R22_COMMENT,
      from: { path: '^packages/core/src/services\\.ts$' },
      to: { path: REGISTRIES_AND_INDEX, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'core-layers-registries-below-index',
      severity: 'error',
      comment: R22_COMMENT,
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
        // zod is matched by resolved path, not the raw specifier: once
        // Matched by resolved path: `^zod$` only matched the fallback dependency-cruiser uses when resolution fails.
        pathNot: ['\\.constants\\.ts$', '(^|/)node_modules/zod/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'frontend-values-only-constants',
      severity: 'error',
      comment:
        'ADR-022 R12: a web app value-imports @openpanel/core or @openpanel/db only through a ' +
        '*.constants.ts path — everything else arrives as `import type`, which is erased, so no ' +
        'server code reaches a browser bundle. M15-010 widened the FROM side: it read `apps/start` ' +
        'alone, which left apps/public and packages/sdks/* unguarded by R12 (ADR-022, "The ' +
        'existing frontend boundary needs widening at the same time"). @openpanel/shared is ' +
        'deliberately NOT in the TO list — its root entrypoint is meant to be value-imported by a ' +
        'browser, which is what `shared-root-stays-isomorphic` below makes safe. NOTE: only ' +
        "`apps/start packages` are cruised today (package.json's check:deps), so the " +
        'apps/public half of this rule holds vacuously until that command names it.',
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
        "ADR-022 R21: nothing reachable from @openpanel/shared's ROOT entrypoint may import a " +
        "node: builtin or the server/ subtree. This is the load-bearing half of R21's pair: a " +
        'root-reachable file that quietly imports node:crypto still type-checks, still bundles, ' +
        'and puts a Node polyfill (or a broken bundle) in every browser that loads the ' +
        'dashboard — and the import looks isomorphic at the call site, so nothing else would ' +
        'catch it. Node-only code has its own entrypoint, @openpanel/shared/server, and the ' +
        'reachability is computed from src/index.ts rather than per-file so a helper added three ' +
        'hops down is covered too. dependency-cruiser reports a node: specifier with the prefix ' +
        'stripped, hence the two spellings.',
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
        'ADR-022 R21: a web app may not import @openpanel/shared/server. This is the readable ' +
        "half of R21's pair — the deliberate wrong import, a frontend reaching for a " +
        'server-only helper (crypto, encryption, safe-fetch, ssrf, parser-user-agent). Unlike ' +
        'the root rule above it does not need reachability: the specifier itself is the ' +
        'violation. Same caveat as frontend-values-only-constants — apps/public is not cruised ' +
        "by package.json's check:deps yet, so that third of the FROM side is vacuous today.",
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

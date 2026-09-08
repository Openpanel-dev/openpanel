/**
 * ADR-008 (constants isomorphism) and ADR-022 R22 (layers only import downward)
 * enforcement. See decisions/ADR-008-constants.md and
 * decisions/ADR-022-core-conventions.md in the controller repo.
 *
 * The rules, in the order they appear below:
 *  - core-uses-ctx-not-db-internals: packages/core reaches Postgres/ClickHouse
 *    through ctx.db / ctx.ch, never by acquiring its own client.
 *  - core-no-self-barrel: a file under packages/core/src imports its siblings
 *    relatively, never through @openpanel/core.
 *  - core-layers-*: ADR-022 R22, one rule per layer boundary (see below).
 *  - constants-stay-isomorphic: a `*.constants.ts` file may depend on nothing
 *    but zod, another `*.constants.ts` file, or a type-only specifier.
 *  - frontend-values-only-constants: apps/start may only VALUE-import
 *    @openpanel/core or @openpanel/db through a `*.constants.ts` path.
 *
 * Both rules match by filename pattern, not by a hardcoded package.json
 * "exists" check, so they hold vacuously (0 matches, exit 0) today, while
 * `packages/core` does not exist yet, and start firing the moment the first
 * `*.constants.ts` file (or a stray value-import of one) lands.
 *
 * ADR-008 Benchmark 1 ("prove dependency-cruiser resolves @openpanel/*, both
 * rules must FAIL on a deliberate violation"), rerun 2026-09-01 with fixtures
 * placed in `packages/trpc` (a real package that already depends on zod,
 * date-fns AND @openpanel/db, so resolution is real, not the couldNotResolve
 * fallback — see the two review notes below for why that distinction matters)
 * plus `apps/start`:
 *
 *   Fixture A: packages/trpc/src/__dc_fixture__/tmp.constants.ts
 *     import { formatISO } from 'date-fns';           // real npm package
 *     export const TMP_FIXTURE_TIMESTAMP = formatISO(new Date());
 *
 *   Fixture B: apps/start/src/__dc_fixture__.ts
 *     import { db } from '@openpanel/db';
 *     export const tmpDb = db;
 *
 *   $ pnpm run check:deps
 *     error frontend-values-only-constants: apps/start/src/__dc_fixture__.ts → packages/db/index.ts
 *     error constants-stay-isomorphic: packages/trpc/src/__dc_fixture__/tmp.constants.ts → node_modules/.pnpm/date-fns@3.3.1/node_modules/date-fns/index.js
 *     x 2 dependency violations (2 errors, 0 warnings). 1684 modules, 6462 dependencies cruised.
 *     (exit 2)
 *
 * The node:crypto builtin case (no node_modules involved at all) was checked
 * too, as a regression guard, and also fires:
 *
 *     error constants-stay-isomorphic: packages/trpc/src/__dc_fixture__/tmp.constants.ts → crypto
 *
 * The allow-list side was checked in the same location: a constants file
 * importing zod, a sibling `*.constants.ts`, and an `import type { ... } from
 * '@openpanel/db'` together produced zero violations. All fixtures were then
 * deleted (never committed) and the run went green:
 *
 *   $ pnpm run check:deps
 *     ✔ no dependency violations found (1681 modules, 6460 dependencies cruised)
 *     (exit 0)
 *
 * Two things this rerun corrects from the first pass at this task, both
 * caught by choosing a fixture location where resolution actually succeeds
 * instead of one where it silently fails closed:
 *
 *  1. `options.exclude: { path: 'node_modules' }` must NOT be set (see the
 *     comment on `doNotFollow` below) — with it, dependency-cruiser drops
 *     every real npm-package dependency (zod, date-fns, …) out of
 *     getDependencies() before any rule runs, because they resolve through
 *     pnpm's `.pnpm/.../node_modules/...` store layout. constants-stay-isomorphic
 *     would then only ever catch node:crypto-style builtin violations, never
 *     the npm-package case ADR-008 Risk #6 names. The very first fixture
 *     attempt used `packages/common` (a package that declares neither zod
 *     nor @openpanel/db as a dependency), so both imports failed to resolve
 *     for the unrelated reason of not being installed there, fell back to
 *     the raw specifier string, and coincidentally still matched the
 *     `exclude`-broken config — hiding the bug instead of catching it.
 *  2. The zod allow-list entry must match the *resolved* path
 *     (`(^|/)node_modules/zod/`), not the bare specifier (`^zod$`). `path`
 *     conditions match against `resolved`, and once zod actually resolves
 *     that's a real file path, never the literal string "zod" — `^zod$`
 *     only ever matched the couldNotResolve fallback, which is the same
 *     wrong-package artifact as point 1, not a legitimate isomorphic import.
 *
 * Resolution across the real `@openpanel/db` workspace symlink (not just the
 * `packages/trpc` fixture) was also exercised for free: apps/start already
 * has dozens of `import type { ... } from '@openpanel/db'` sites today, all
 * type-only, and all correctly passed by `dependencyTypesNot: ['type-only']`
 * — i.e. resolution AND type-only detection both work, ADR-008 risk 1 does
 * not apply, Option A (deep paths + this config) stands.
 *
 * `check:deps` runs the DECLARED `dependency-cruiser` devDependency
 * (M14-002; ADR-017's exception register reopened after P13, Carl 2026-09-08),
 * replacing `tooling/scripts/check-deps.ts`, which existed only because neither
 * `bunx` nor `pnpm dlx` could be relied on to put `typescript` where the tool
 * looks for it. dependency-cruiser classifies an edge as `type-only` only when
 * it can load the TypeScript compiler, and it resolves `typescript` — its own
 * optional peer — from ITS OWN directory, an ESM lookup `NODE_PATH` cannot
 * influence. Under `bunx` that failed: `depcruise --info` reported
 * `typescript … -`, and the cruise returned 82 false
 * `core-uses-ctx-not-db-internals` violations, every one an `import type` line
 * the rule explicitly allows.
 *
 * Measured on this box on 2026-09-08, with the tool declared and
 * `bunfig.toml`'s `linker = "isolated"` in force: `bunx --no-install depcruise
 * --info` reports `✔ typescript >=2.0.0 <7.0.0  typescript@5.9.3`, and the
 * cruise reproduces the runner's numbers exactly — 2700 modules, 18121
 * dependencies, 0 errors. The isolated layout is WHY it works: bun's store
 * lives at `node_modules/.bun/` INSIDE the repo, so node's upward walk from
 * `node_modules/.bun/dependency-cruiser@18.2.0/node_modules/dependency-cruiser`
 * still reaches the repo root `node_modules/typescript`. A global `bunx` cache
 * directory never could.
 */
// ADR-022 R22 — layers only import downward. The order, lowest first:
//
//   shared < clients < transport infrastructure (rpc/, http/, jobs/)
//          < modules < services.ts < registries < index.ts
//
// It is a LAYER order, not path depth: a module importing `../../jobs/define`
// is going DOWN, and must not be flagged. rpc/, http/ and jobs/ are ONE layer
// (rpc/base.ts, http/define.ts and jobs/define.ts are peers), so edges among
// them are sideways, not up. Cross-module edges are likewise sideways — every
// module is the same layer — so they are out of R22's scope; R1/R3 own those.
//
// One dependency-cruiser rule is a single from × to rectangle, and "every layer
// may import every LOWER layer" is a triangle, so R22 lands as one rule per
// layer boundary. All six share the `core-layers-` prefix and this comment.
const R22_COMMENT =
  'ADR-022 R22: layers only import downward — shared < clients < transport ' +
  'infrastructure (rpc/, http/, jobs/) < modules < services.ts < registries < ' +
  'index.ts. By LAYER, not by path depth: a module importing ../../jobs/define ' +
  'is going down and is not a violation, and rpc/ http/ jobs/ are one layer so ' +
  'edges among them are sideways. Infrastructure reaches a module\'s behaviour ' +
  'through deps/ctx, never by deep-importing modules/<name>/src/*. Two upward ' +
  'edges are legal, both type-only and both exempted on ' +
  'core-layers-modules-below-composition: a module importing ServiceDeps / ' +
  'Services from services.ts (R3 requires it — all 36 factories do it), and a ' +
  'module importing another module\'s <name>.constants.ts (R8 blesses that ' +
  'file). Landed at `warn` by M14-002 with 23 violations, exactly as ' +
  'core-uses-ctx-not-db-internals did in M10-001; the fix wave flips it to ' +
  '`error` at 0. Baseline, measured 2026-09-08: 7 from shared/, 6 from ' +
  'clients/, 10 from rpc/ + http/ + jobs/, 0 from modules/ and above.';

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
        "@modelcontextprotocol/sdk signature (modules/mcp/src/auth.ts lazy-imports it; the gsc " +
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
      severity: 'warn',
      comment: R22_COMMENT,
      from: {
        path: '^packages/core/src/shared/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: [ABOVE_SHARED, COMPOSITION_AND_ABOVE] },
    },
    {
      name: 'core-layers-clients-below-transport',
      severity: 'warn',
      comment: R22_COMMENT,
      from: {
        path: '^packages/core/src/clients/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: [ABOVE_CLIENTS, COMPOSITION_AND_ABOVE] },
    },
    {
      name: 'core-layers-transport-below-modules',
      severity: 'warn',
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
      severity: 'warn',
      comment: R22_COMMENT,
      from: {
        path: '^packages/core/src/modules/',
        pathNot: '\\.test\\.ts$',
      },
      to: {
        path: COMPOSITION_AND_ABOVE,
        // R8 blesses `<name>.constants.ts` as the one file that may be imported
        // as a VALUE across a boundary, so a module reaching one is never a
        // layering violation.
        pathNot: '\\.constants\\.ts$',
        // R3 REQUIRES this edge: every one of the 36 factories is
        // `createXService(deps: ServiceDeps, services: () => Services)`, and
        // both names live in services.ts. All 47 such imports in the tree today
        // are `import type`, which is what keeps the edge type-only and legal.
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-layers-composition-below-registries',
      severity: 'warn',
      comment: R22_COMMENT,
      from: { path: '^packages/core/src/services\\.ts$' },
      to: { path: REGISTRIES_AND_INDEX, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'core-layers-registries-below-index',
      severity: 'warn',
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
        // pnpm actually resolves it (package declares it as a dependency),
        // `resolved` is a real file under `node_modules/(.pnpm/.../)?zod/`,
        // never the bare string "zod" — `^zod$` only ever matched the
        // fallback value dependency-cruiser uses when resolution fails
        // entirely, which isn't the case ADR-008 needs covered here.
        pathNot: ['\\.constants\\.ts$', '(^|/)node_modules/zod/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'frontend-values-only-constants',
      severity: 'error',
      comment:
        'apps/start may value-import @openpanel/core or @openpanel/db only via a *.constants.ts path.',
      from: { path: '^apps/start' },
      to: {
        path: '^packages/(core|db)/',
        pathNot: '\\.constants\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
  ],
  options: {
    // Only stops the crawl from recursing INTO node_modules (so we don't
    // cruise zod/date-fns internals); it still leaves the edge FROM our file
    // TO the npm package in that file's dependency list, so rules still see
    // it. Do NOT add `options.exclude` here — see header comment point 1.
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};

/**
 * ADR-008 enforcement (see decisions/ADR-008-constants.md in the controller repo).
 *
 * Two rules only:
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
 * `check:deps` (package.json) runs this via `pnpm dlx` rather than a pinned
 * devDependency, to keep this task's diff to `.dependency-cruiser.cjs` +
 * `package.json` only (no pnpm-lock.yaml churn). `pnpm dlx --package` does
 * NOT hoist a `typescript` peer into dependency-cruiser's own resolution
 * scope, so without help it silently falls back to the acorn/JS-only
 * transpiler and skips every .ts/.tsx file (0 modules cruised, falsely
 * green). The script sets `NODE_PATH` to the repo's own `node_modules`
 * (which already carries `typescript` as a root dependency) so
 * dependency-cruiser's internal `require('typescript')` resolves via node's
 * NODE_PATH fallback — verified with `--info`, which flips typescript from
 * `x` to `✔` once NODE_PATH is set.
 */
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

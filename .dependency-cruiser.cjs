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

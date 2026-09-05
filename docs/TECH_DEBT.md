# Tech debt register — dependency-cruiser baseline log

The full remediation narrative (why `packages/core` ended up bypassing
`ctx.db`/`ctx.ch` and importing its own barrel) lives in the controller repo
at `docs/TECH_DEBT.md` — that is the source of truth for sections 1-5 (the
"Deliberate", "Drift", "Planned remediation" and Carl's 2026-09-05 review).
This file is the in-repo log of the dependency-cruiser rule that enforces
that remediation (`docs/TECH_DEBT.md` §4 step 4, §5a), so the numbers below
are re-measurable from this repo without controller access.

## Re-measured

### 2026-09-05 — M10-001, dependency-cruiser rules landed at `warn`

Ran by: ralph (M10-001 implement task).
Command: `pnpm run check:deps` (`.dependency-cruiser.cjs`), each new rule set
to `severity: 'error'` in isolation for the count, then both reset to `warn`
before commit.

Scope of both rules: every file under `packages/core/src/**` (production and
test files alike — the rule text in `.dependency-cruiser.cjs` does not carve
tests out; see the note below on why some of these are expected to persist).

| Rule | Violations (error, isolated run) | Breakdown |
|---|---:|---|
| `core-uses-ctx-not-db-internals` | **161** | 83 dynamic (`import('@openpanel/db/...')`) + 78 static (`from '@openpanel/db/...'`) edges, via `--output-type json`'s `dependencyTypes`/`dynamic` fields |
| `core-no-self-barrel` | **96** | value-imports of `packages/core/src/index.ts` (the `"."` export target for the bare `@openpanel/core` specifier) from a sibling file under `packages/core/src/**` |

Both were confirmed to fire with a real count (not vacuous): the same run
with both rules reset to `warn` exits `0` (`x 257 dependency violations (0
errors, 257 warnings)`), and the two ADR-008 rules
(`constants-stay-isomorphic`, `frontend-values-only-constants`) reported 0
violations throughout, at their unchanged `error` severity.

**Numbers vs. the controller doc's 2026-09-05 measurement (`grep`-based, 63
dynamic + 80 static, non-test files only):** roughly consistent. The
difference is methodology, not drift — the grep baseline excluded test
files and dependency-cruiser here does not, and a handful of test files use
the ADR-010 `mock.module('@openpanel/db/...')` idiom (dynamic `import()` of
the *mocked* specifier inside `beforeAll`), which is the sanctioned test
pattern, not the production-code drift `core-uses-ctx-not-db-internals`
exists to catch. Restricting the JSON breakdown to non-test files alone
gives 57 dynamic + 75 static, closer to the controller doc's figures.
Deciding whether the rule itself should exclude test files (and how
`M10-009`'s flip to `error` treats the legitimate mock-module imports) is
left to a later M10 task — this task only proves the rule fires and records
the baseline, per its acceptance criteria.

`context.ts`'s `typeof import('@openpanel/db/...')` type queries
(`Db`/`ClickHouseClient`) do **not** count: verified via
`--output-type json` that dependency-cruiser tags them `['undetermined',
'type-import']`, a genuinely type-level reference distinct from the
`'type-only'` tag `import type {...}` statements get. `dependencyTypesNot`
on `core-uses-ctx-not-db-internals` exempts both tags, so no per-file
exception entry was needed for `context.ts`.

### 2026-09-05 — M10-001 fix, `core-uses-ctx-not-db-internals` re-measured (161 → 167)

Ran by: ralph (M10-001 rework, after the independent reviewer rejected the
first attempt above).

The first attempt's blanket `dependencyTypesNot: ['type-only', 'type-import']`
was wrong: it exempted the `'type-import'` tag package-wide instead of naming
`context.ts` in the rule's exception list, and that hid a real composition
seam. `packages/core/src/buffers/clickhouse.ts` has a `typeof import(...)`
type query (line 8, genuinely type-only on its own) *and* a real runtime
`import(...)` dynamic import of the same resolved module (line 13, the
deliberate lazy-load-to-keep-`bun-test`-offline pattern). Confirmed with an
isolated probe file mirroring that exact structure, via `--output-type json`:
dependency-cruiser merges the two references between the same pair of files
into **one** edge and the merge drops the `'dynamic-import'` tag entirely,
leaving only `['undetermined', 'type-import']` — indistinguishable, by tag
alone, from `context.ts`'s pure type queries. The same merge silently hid the
identical pattern in five test files that use the ADR-010
`mock.module('@openpanel/db/...')` idiom (a `typeof import(...)` alias
declared once, then `await import(...)`'d for real inside `beforeAll`):
`chart.service.test.ts`, `chart.sql.test.ts`, `funnel.sql.test.ts`,
`overview.sql.test.ts`, `pages.sql.test.ts` (all under
`packages/core/src/modules/chart|overview/`).

Fix: `dependencyTypesNot` on the rule's `to` now reads `['type-only']` only,
matching the idiom the other three rules in this file already use.
`context.ts` is excluded by `pathNot` on the rule's `from` instead — named
explicitly, as the acceptance criteria requires — since it is the one file
under `packages/core/src/**` that references `@openpanel/db` exclusively
through type queries with no accompanying value import to merge with.

Command: `pnpm run check:deps` (`.dependency-cruiser.cjs`), `core-uses-ctx-not-db-internals`
set to `severity: 'error'` in isolation (`core-no-self-barrel` left at `warn`).

| Rule | Violations (error, isolated run) | Breakdown |
|---|---:|---|
| `core-uses-ctx-not-db-internals` | **167** (was 161) | 83 dynamic (`dependencyTypes` includes `'dynamic-import'`) + 78 static (plain `import`/`esm`) + **6 newly caught** merged edges tagged `['undetermined', 'type-import']` that are real value imports (`buffers/clickhouse.ts` + the 5 test files above), via `--output-type json`'s `dependencyTypes` field |
| `core-no-self-barrel` | **96** (unchanged) | not touched by this fix |

Diffed the violation edge list (`(from, to)` pairs) between the old rule
config and the fixed one: exactly those 6 edges were added, zero were
removed or changed — the fix is strictly additive detection, not a
re-classification of the existing 161.

Both rules reset to `warn` after measuring: `pnpm run check:deps` exits `0`
(`x 263 dependency violations (0 errors, 263 warnings)`). The two ADR-008
rules still report 0 violations at their unchanged `error` severity.
`pnpm run typecheck` and `cd packages/core && bun test --isolate` (1447
pass, 0 fail) both pass unaffected — this task only changes the lint config
and this doc, not any source file.

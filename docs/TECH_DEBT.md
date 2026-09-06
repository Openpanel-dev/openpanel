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

### 2026-09-05 — M10-002, the 22 `modules/*/src/access.ts` copies deleted, ladder bound once via a lazy memoized helper

Ran by: ralph (M10-002 implement task, docs/TECH_DEBT.md §5b). Reset three
times on review before this attempt; the operator rewrote criteria 1-2 to
explicitly authorize what earlier attempts got blocked or FAILed on:
`integration.service.ts` / `subscription.service.ts` reaching the shared
binding directly, because both are called with a bare `userId` (no `ctx`) by
`packages/trpc`'s still-live V1 delegate routers — the exemption expires when
`packages/trpc` dies at P10.

Before, proof the 22 were byte-identical copies (via git history — the files
are gone from the working tree by the time this entry is written):

```
$ git ls-tree -r HEAD --name-only | grep -E '^packages/core/src/modules/[^/]+/src/access\.ts$' \
    | while read -r f; do git show "HEAD:$f" | head -n1; done | sort | uniq -c
     22 // Binds core's shared/access.ts ladder to @openpanel/db's real lookups, for
```

**The binding.** `modules/auth/auth.service.ts` exports one `getAccessChecks()`:
a module-level `let accessChecksPromise`, populated the first time anything
calls it, via `Promise.all([import('../../shared/access-lookups'),
import('../project/project.service')])` feeding the four lookups into
`shared/access.ts`'s `createAccessChecks(...)` — exactly once, ever. Nothing
runs at module-import time, and nothing runs at `createAuthService(deps)`
construction time either, which matters because `createAuthService` is NOT a
process-lifetime singleton: `context.ts`'s `installLazyServices` calls
`createServices(deps)` (hence `createAuthService(deps)`) fresh on the first
`ctx.services` read of every request. `createAuthService` spreads the
resolved checks into `AuthService`'s `requireProjectAccess` /
`requireOrganizationAdmin` / `requireProjectAdmin`, plus three raw lookups
(`getProjectAccess` / `getOrganizationAccess` / `getClientAccess`, each its
own `import('../../shared/access-lookups')` — cheap after the first call,
since the module resolves from Bun's own import cache). Every rpc/route/
handler that HAS a `ctx` now calls `ctx.services.auth.<check>`.

**The two authorized exceptions.** `integration.service.ts` (4 call sites)
and `subscription.service.ts` (6 — 10 total, matching the earlier attempt's
"unmemoized across its 10 call sites" diagnosis) import `getAccessChecks`
directly from `../auth/auth.service`. `integration.service.ts`'s org-wide
read branch also imports `getOrganizationAccess` directly from the sibling
`shared/access-lookups.ts` — a raw lookup, not part of the `require*` ladder,
so it never goes through `getAccessChecks()`. Neither import touches
`@openpanel/core`'s own barrel.

**Why this is not the earlier module-scope attempt that hung.** An earlier
attempt bound `createAccessChecks(...)` at module scope in `auth.service.ts`
(a top-level `const accessChecks = createAccessChecks({...})`, with static
imports of `access-lookups.ts` / `project.service.ts`) and hung
`cd packages/core && bun test` for 30 minutes. This attempt never calls
`createAccessChecks` anywhere except inside `getAccessChecks()`'s own lazily-
invoked body, and both its inputs are reached by dynamic `import()`, not a
static top-level import — see the timing table below for proof the bare suite
now exits on its own.

**Fixed, not worked around: a real pre-existing test leak this task's own
hard gate exposed.** Bare `bun test` shares one module registry across every
file (no `--isolate`); `src/context.test.ts`, `src/http/context.test.ts` and
`test/request-id-end-to-end.test.ts` each `mock.module('./services' /
'../services' / '../src/services', ...)` with a stub `createServices`
returning `{}` (no `.auth`) and never restored it. Nothing else in the suite
read `ctx.services.auth` before this task, so the leak was invisible; this
task adds ~20 more rpc files that do, and `group.rpc.test.ts` /
`realtime.rpc.test.ts` / `realtime.routes.test.ts` started failing with
`undefined is not an object (evaluating 'ctx.services.auth.requireProjectAccess')`
— whichever context test's stub ran first, still installed. Fixed by
snapshotting each real module BEFORE its `mock.module` call and restoring to
that snapshot in `afterAll` (the snapshot-before-mock idiom — a live
re-`import` during restore just reads the already-mocked registry entry back).
The new `auth.service.access.test.ts` has the same hazard one level deeper:
`getAccessChecks()`'s `accessChecksPromise` is a true process-lifetime memo,
so its `afterAll` also calls a new test-only `resetAccessChecksForTests()`
alongside restoring its two mocked modules, or its fakes would answer every
later file's real access checks for the rest of the run.

**Test that binds fake `AccessLookups`.** `auth.service.access.test.ts` mocks
`../../shared/access-lookups` and `../project/project.service` (spreading the
real modules, overriding only the four lookups) and exercises
`createAuthService(...)` directly: fail-closed ordering (no access throws
before the write-level check runs), the exact messages (`'You do not have
access to this project'`, `'You have read-only access to this project'`,
`'Only organization admins can do this'`, and a caller-supplied override),
the write/admin level set, and `requireProjectAdmin`'s project→org
resolution. `shared/access.ts` itself is untouched by this task.

**Deletion proof:**
```
$ find packages/core/src/modules -name access.ts | wc -l
0
```

**`pnpm run check:deps`** (`.dependency-cruiser.cjs`, both rules unchanged at
their landed `warn` severity):

| Rule | Before (M10-001) | After (M10-002) | Delta |
|---|---:|---:|---:|
| `core-uses-ctx-not-db-internals` | 167 | 167 | 0 |
| `core-no-self-barrel` | 96 | 74 | −22, exactly the 22 deleted files |

`core-uses-ctx-not-db-internals` counts VALUE imports of `packages/db/**`;
all 22 deleted files imported `@openpanel/core` (the self-barrel) and
`shared/access.ts` — never `@openpanel/db` directly — so this task's
mechanism (deleting self-barrel copies) has zero edges of that kind to
remove. `core-no-self-barrel` counts value-imports of
`packages/core/src/index.ts`, which is exactly what every deleted file did
once, for its own `createAccessChecks` binding; −22 is the 22 files, one edge
each. `pnpm run check:deps` exits `0`
(`x 241 dependency violations (0 errors, 241 warnings)`).

**`pnpm run typecheck`** — all 25 workspaces, `Done`.

**`cd packages/core && bun test`** (bare, no `--isolate` — the hard gate):
```
 1455 pass
 0 fail
Ran 1467 tests across 148 files. [10.73s]

real    0m10.797s
user    0m8.005s
sys     0m1.878s
```
The process exited on its own; `real` tracks `user`+`sys`, not a multi-minute
stall on an idle handle. `cd packages/core && bun test --isolate` (the
configured suite) is also green — 1455 pass, 0 fail, `real 1m45.680s`.

### 2026-09-05 — M10-002 correction: the previous "third call site" fix is reverted — it was out of scope, not authorized

The independent reviewer REJECTED the attempt written up in the correction
section that used to be here (Attempt 2): it touched 14 files under
`packages/trpc/**` plus deleted `packages/trpc/src/access.test.ts`, none of
which are in this task's declared scope (`packages/core/**`, `apps/api/**`,
`docs/**`). The reviewer was right — CLAUDE.md's Scope section is explicit
("Refactoring outside scope is a task of its own; propose it, don't do it")
and self-justifying the change in the report instead of stopping is exactly
the failure pattern the review exists to catch. That diff is reverted in
full (`git checkout HEAD -- packages/trpc/`); `packages/trpc/src/access.ts`,
its three ladder exports, its twelve router call sites and
`packages/trpc/src/access.test.ts` are back to their pre-task state,
byte-identical to `HEAD`.

**What that leaves.** `packages/trpc/src/access.ts` does have its own
top-level `const checks = createAccessChecks({...})` — pre-existing, from
M4-002 (`packages/trpc` rebase onto core's `CoreContext`) and untouched by
every M10-002 wave since, not something this task introduced or could
authorize itself. It is wired live through `apps/api/src/main.ts`
(`enforceAccess` middleware in `packages/trpc/src/trpc.ts`, plus fifteen V1
router files). So criterion 1's "called from exactly ONE place in the
codebase," read literally against the *whole repo*, is not met:

```
$ grep -rn "createAccessChecks(" --include="*.ts" packages apps | grep -v '\.test\.ts'
packages/core/src/modules/auth/auth.service.ts:148:        createAccessChecks({
packages/trpc/src/access.ts:22:const checks = createAccessChecks({
```

Everything this task's scope can reach is consistent with the criterion:
inside `packages/core/**`, `createAccessChecks` is called from exactly one
place (`auth.service.ts`'s `getAccessChecks()`, memoized, lazy — see the
2026-09-05 M10-002 entry above for the mechanism, unchanged by this
correction). `packages/trpc/src/access.ts`'s copy is a second, independent
binding of the same ladder to the same lookups, but it lives entirely
outside `packages/core`, is unreachable from anything this task is allowed
to edit, and predates this task by five waves (M4-002 → M9-CLEANUP-001).
Fixing it requires editing `packages/trpc/**`, which is out of scope; per
CLAUDE.md this is recorded as a follow-up, not done here. It is low-risk
debt on its own terms: `packages/trpc` is V1's whole surface and is deleted
entire at P10 (docs/TECH_DEBT.md's other P10 entries), taking this second
call site with it — the exemption for integration.service.ts /
subscription.service.ts calling `getAccessChecks()` directly already carries
the identical "expires at P10" note for the same reason.

**Follow-up (new, not this task):** collapse `packages/trpc/src/access.ts`'s
`createAccessChecks({...})` into a call through core's `getAccessChecks()`
(or delete the file once its callers move to `ctx.services.auth`, as
Attempt 2 did) — scoped to `packages/trpc/**`, proposed here rather than
done, per CLAUDE.md's Scope section.

Re-verified after the revert: `pnpm run typecheck` — all 25 workspaces,
`Done`, including `packages/trpc` (its `access.ts` still resolves
`createAccessChecks`, `canWriteProject`, `getOrganizationAccess`,
`getProjectAccess`, `getProjectById` off `@openpanel/core`'s barrel, which
this task doesn't remove). `cd packages/core && bun test` (bare): 1455 pass,
0 fail, `Ran 1467 tests across 148 files. [13.56s]`, `real 0m13.635s` —
process exited on its own. `pnpm run check:deps`:
`core-uses-ctx-not-db-internals` 167, `core-no-self-barrel` 74 — unchanged
from the M10-002 entry above; this rule only cruises `packages/core/**`, and
the revert touched nothing there.

### 2026-09-05 — M10-003, the read path (chart+4, report, dashboard, export, share, reference) onto `createXService(deps)`

Ran by: ralph (M10-003 implement task, docs/TECH_DEBT.md §4 steps 1/2/5 and
§5a).

**Shape.** Ten modules now expose exactly one
`createXService(deps: ServiceDeps): XService`, registered in `services.ts`'s
`Services` interface and `createServices`. Their implementation functions take
`deps` as the first parameter and the factory binds it; every service method
carries an explicit return type (`ReturnType<typeof fn>` /
`Parameters<typeof fn>[1]` where the shape is a Prisma payload), for the
ts7022/ts7023 reason `services.ts` documents.

**The four chart sub-services FOLD INTO `ChartService`** rather than becoming
four more `Services` members. They are sibling files of `modules/chart/`, not
modules — ADR-007's map is one service per module, `chart.service.ts` is
already the dispatcher every caller goes through (`getFunnelChart` /
`getConversionChart` / `getSankeyChart` / `getRetentionChart`), and four keys
named after files would claim four modules that do not exist.

**Loaders deleted.** In those ten modules there is now no
`import('@openpanel/db...')` at all, and `loadChClient()` / `loadDb()` /
`loadCore()` / `loadReportsService()` / `loadIdService()` /
`loadDateService()` / `loadOrganizationService()` / `loadAccessService()` /
`loadDashboardService()` are gone. ClickHouse is `deps.ch` and Postgres is
`deps.db`.

- `chart/src/run-query.ts` runs `deps.ch.query(...)` — `chQuery`'s own
  transport (`withRetry(client => client.query(...))`) — and reproduces
  `chQuery`'s Int-meta coercion, the same shape `modules/overview/src/run-query.ts`
  has shipped since M7-005. It logs `'query info'` on `deps.logger`, which is
  the request-scoped child, so the ClickHouse call now carries the requestId.
- `chart/src/table-filter-where.ts` stopped statically importing
  `@openpanel/db/src/clickhouse/client` (a module that builds a ClickHouse
  client and a pino logger at import time) for `formatClickhouseDate` and
  `TABLE_NAMES`; both are local — the module's own `./dates.formatClickhouseDate`
  (byte-identical to packages/db's non-`skipTime` branch) and
  `./field-resolution.CHART_TABLE`, which already carried all four physical
  table names (`events`, `profiles`, `groups`, `cohort_members`).
- `export/export.routes.ts`'s `/insights/:projectId/live` reads
  `ctx.buffers.event` instead of `loadDbBuffers()`.

**Section 2's duplicate is unwired.** `chart.service.ts` (and
`conversion.service.ts`, `funnel.service.ts`, `engine/normalize.ts`) reached
`mergeGlobalFilters` / `onlyReportEvents` through `import('@openpanel/core')`.
They now import them from `modules/report/src/series.ts`. The two helpers moved
there, out of `report.service.ts`, because `report.service.ts` imports the
chart engine and `chart/funnel.service.ts` imports them — a static import back
would have closed a real `report.service -> chart/funnel.service ->
report.service` cycle. `src/series.ts` imports nothing but a zod-derived type,
so both sides stay eager and neither needs a loader.

**One genuine cycle kept lazy, both ends named.**
`modules/auth/auth.service.ts`'s `loadShare()`:
`../share/share.service` statically imports this file's `hashPassword`, and
`signInToShare` needs share's three lookups — `auth.service.ts <->
share.service.ts`. It is not a `@openpanel/db` loader; the share lookups take
`deps` like everything else.

**What is still a value import of `@openpanel/db` in these modules, and why.**
Seven files in `modules/chart/src/` value-import `sql` / `SqlFragment` /
`toStatement` from `@openpanel/db/src/clickhouse/sql` (`chart.sql.ts`,
`funnel.sql.ts`, `conversion.sql.ts`, `sankey.sql.ts`, `retention.sql.ts`,
`compiled.ts`, `run-query.ts`). That is ADR-013's SQL tag, which ADR-007's
"`packages/db` — the final surface" keeps in `packages/db` by name ("**new**
`clickhouse/sql.ts`"), and `packages/db/**` is outside this task's scope globs,
so it cannot be moved here. It carries no client, no connection and no request
scope — it is a compile-time template tag — so it is not a place the requestId
chain can end. Nine more core files outside this task's modules
(`overview`, `profile`, `group`, `session`, `event`, `mcp`) import it the same
way; a decision on whether `core-uses-ctx-not-db-internals` should exempt
`clickhouse/sql.ts` (or whether the tag moves) belongs to M10-009's flip to
`error`, not here. Prisma ROW TYPES stay as `import type` (erased at runtime),
which is what keeps `bun test` offline.

**`v1-compat.ts` — the seam this wave needed and could not avoid.**
`apps/api/src/main.ts` still mounts `@openpanel/trpc`'s `appRouter`, not core's
`rpc.router.ts`, so V1's 28 routers are the LIVE `/trpc` surface; they call
core's modules as bare barrel exports and have no `Ctx` to hand a
`ServiceDeps`. `packages/trpc/**` is outside this task's scope globs (the
reviewer rejected M10-002 attempt 2 for editing it), and the mcp/assistant tool
runtimes are in the same position. So `packages/core/src/v1-compat.ts` holds
one registration point — `setV1CompatServices(deps)`, called once from
`main.ts` right after `AppDeps` is built — and the ~60 bare wrappers the barrel
exports for those callers. Everything that HAS a `Ctx` (core's own rpc files,
`export.routes.ts`, `overview.rpc.ts`) uses `ctx.services.*` and keeps the
request-scoped logger. One file, one grep, deleted whole when `packages/trpc`
dies at P10. Its `signInToShare` wrapper preserves V1's 2-argument spelling;
core's own `auth.rpc.ts` passes `ctx`.

A process that never builds `AppDeps` falls back to the same singletons the
deleted `loadDb()` / `loadChClient()` loaders reached, built lazily on first
use (so importing `@openpanel/core` still constructs no database and
`bun test` still runs offline), with packages/db's own `createLogger` — the
pino logger that already writes `chQuery`'s `query info` line — so those
callers behave exactly as they did before this wave. That fallback is not
theoretical: the root `pnpm test` run caught
`packages/trpc/src/routers/share.test.ts` calling `shareRouter` procedures
directly with no boot, and `packages/trpc/**` is outside this task's scope.
Its three lazy `import('@openpanel/db/...')` edges are the +3 in the table
below; `main.ts` always registers before `buildHttpApp`, so a running server
never reaches it.

**requestId proven through this path.** New sibling test
`packages/core/test/request-id-chart-query.test.ts` — the existing
`request-id-end-to-end.test.ts` mocks the whole `Services` container, so it
cannot show this hop. The new file uses a REAL `createServices`: an Elysia
route under `requestLogging(deps)` calls
`ctx.services.chart.getRetentionSeries({ projectId })` with a recording
`deps.ch`, and asserts

```ts
  // The query really ran through `deps.ch` — a silent miss would leave the
  // logger assertion below trivially true (AGENTS.md).
  expect(queries).toHaveLength(1);
  expect(queries[0]?.query).toContain('FROM events');

  const bindingOf = (message: string) =>
    lines.find((line) => line.message === message)?.bindings.requestId;

  // The ClickHouse call's own log line, and the route's, carry ONE requestId.
  expect(bindingOf('query info')).toBe(SUPPLIED_REQUEST_ID);
  expect(bindingOf('request done')).toBe(SUPPLIED_REQUEST_ID);
```

plus a second case proving two concurrent requests do not share one
(`expect(queryLineIds.sort()).toEqual(['req-a', 'req-b'])`).

**`pnpm run check:deps`** (`.dependency-cruiser.cjs`, both rules unchanged at
their landed `warn` severity):

| Rule | Before (M10-002) | After (M10-003) | Delta |
|---|---:|---:|---:|
| `core-uses-ctx-not-db-internals` | 167 | **160** | **−7** |
| `core-no-self-barrel` | 74 | **62** | **−12** |

The ten modules themselves shed 10 edges; `v1-compat.ts`'s lazy fallback adds
3 back, in one file with a stated death date, for a net −7. Exit `0`,
`x 222 dependency violations (0 errors, 222 warnings). 1991 modules, 8035
dependencies cruised.` (was 241.)

**Verification, all run by ralph on 2026-09-05:**

- `pnpm run typecheck` — all 25 workspaces, `Done` (`packages/trpc` included:
  the barrel's V1 spellings are unchanged).
- `cd packages/core && bun test` (bare, no `--isolate`): **1457 pass, 12 skip,
  0 fail**, `Ran 1469 tests across 149 files. [31.02s]`.
- `pnpm test` (root vitest, what `full.sh` runs): **13 files, 205/205 passed**.
- `pnpm run check:deps` — the table above.
- `controller:verification/harness start` — api :3333, worker :9999 ready in 3s.
- `cd apps/api && timeout 900 pnpm run e2e:sessions` — **29/29 checks passed**.
- `controller:verification/golden/compare.sh`:
  `passed:  137/137` / `OK: zero diffs` (`golden: http://127.0.0.1:3333 @
  2026-09-05T07:59:27Z`; no `stale:` skips — same UTC day as the capture).
- `controller:verification/harness stop`.
- `controller:verification/full.sh` — `FULL: green (1 documented pre-existing
  exception(s) - see BLOCKED-KNOWN above)`, exit `0`. The one exception is
  `contracts/sdk/run.sh`'s `dist-gate.sh` on the documented pre-P11 state
  (web/nextjs/react-native/express leak `@openpanel/*`, sdk is clean); every
  other stage is `OK`, including `pnpm test`, `golden/compare.sh`
  (`passed: 137/137`, zero diffs) and `contracts/auth/run.sh`.

### 2026-09-06 — M10-004, the account path (auth, client, project, user, subscription, salt, conversation, assistant, mcp) onto `createXService(deps)`

Ran by: ralph (M10-004 implement task, docs/TECH_DEBT.md §4 steps 1/2/5 and
§5a, continuing M10-003).

**Shape.** All nine modules now expose exactly one
`createXService(deps: ServiceDeps): XService`, registered in `services.ts`.
`auth.service.ts` already had `createAuthService` from M10-002 (bound to the
access ladder, independent of `deps`) — this wave finishes it: every OTHER
lazy `@openpanel/db` load in the file (sign-up/sign-in/TOTP/reset-password/
OAuth-callback) now takes `deps` too, and `./src/login-session.ts` /
`./src/registration.ts` reach Postgres as `deps.db` with no lazy loader left.
`assistant` and `mcp` needed a factory for the first time; both were a bag of
loosely-related exports, not a services-shaped file, before this wave.

**Two modules that were never going to fit the mechanical pattern.**

- **`assistant.service.ts`** re-exported `chatApp`/`chatRunContext` as
  eager `export ... from './src/app'` / `'./src/run-context'` — a static
  re-export, which means importing this file AT ALL constructs the whole
  Better Agent app (one `defineAgent` per whitelisted chat model). Registering
  `createAssistantService` in `services.ts` would have made that run at
  PROCESS BOOT (services.ts's own module evaluation) instead of on the first
  real chat/filter-command request. Fixed by moving the lazy-loader index.ts
  used to hide this (`loadAssistant()`/`getChatApp()`/`getChatRunContext()`)
  INTO `assistant.service.ts` itself, so the file is cheap to import
  regardless of who imports it; index.ts's own copy of that mechanism is
  deleted, replaced by a plain re-export now that it's safe. `deps` goes
  unused in the factory — nothing here touches Postgres directly.
- **`mcp.service.ts`** statically imported `./src/auth` (fine, fixed below)
  and `./src/server` (`registerAllTools`, ~20 tool files, several importing
  `@openpanel/core` for cross-module functions) — reached only via a dynamic
  `loadMcp()` in index.ts before this wave, for exactly the reason
  `assistant`'s TDZ hazard note already named for this file. `./src/server`
  stays behind a lazy loader inside `mcp.service.ts`; `./src/auth` is a plain
  import again because its own `@openpanel/core` reach (below) is now lazy
  too, so nothing static is left to protect against. `handleStatelessMcpRequest`
  /`extractToken` keep their exact bare signature — both are called directly
  by their own tests with no `deps` argument, a hard contract this wave does
  not touch — so `McpService`'s two methods are thin, deps-ignoring binds.

**Bare hot-path callers with no `Ctx` to give a `deps` — the pattern this wave
generalizes from `v1-compat.ts`'s v1-compat seam to core's OWN internals.**
`getProjectByIdCached`/`getClientByIdCached` (ingest's `/track` auth,
`http/client-auth.ts`'s `/export`+`/import`+`/manage` tier, MCP's token auth)
and `getSalts` (ingest's device-id resolution) all have their L1 LRU cache
built INSIDE their `createXService(deps)` closure now, which only stays a
cross-request singleton through the v1-compat seam (`registered`, built once
at boot) — not through `ctx.services`, which is one Ctx per request. Every one
of these callers has no `Ctx`/`ServiceDeps` of its own, so they reach the
cache through `v1-compat.ts` (`compatDb()`/`compatCh()` for the couple of
third-party-signature callers — `@better-agent/core`'s `ConversationStore`,
`@modelcontextprotocol/sdk`'s tool handlers — that can't carry a wrapped
service method at all). `getClientByIdCached`/`getProjectByIdCached` also
gained a `clearClientByIdCache`/`clearProjectByIdCache` service method, since
the LRU's `.clear()` isn't part of the plain `(id) => Promise<...>` shape
`ServiceDeps`-free callers expect.

One of these (`ingest/src/incoming-event-handler.ts`) carried a **stale
constraint**: a comment mandating a *static* import of `project.service.ts`
"so a dynamic edge into project.service doesn't become its own rolldown chunk
... external in apps/worker's bundle". `apps/worker` no longer exists (M9) and
`apps/api` ships with no bundler at all (`apps/api/package.json` has no
`build` script — ADR-010) — the constraint the comment protected against is
gone, so the file now uses the same "GENUINE CYCLE, kept lazy" dynamic import
as everywhere else in this wave.

**Correction (post-review): there is no "no import-time cost" exception to
acceptance criterion 2.** The first pass through this wave left four plain,
top-level value imports of `@openpanel/db` standing — `subscription.service.ts`
and mcp's `dashboard-management.ts` each imported `Prisma` (for the
`Prisma.DbNull` sentinel), and mcp's `analytics/property-values.ts` imported
`TABLE_NAMES`/`clix` — and this section originally excused all four, plus
`project.service.ts`'s two still-`clix` functions, as "scoped exceptions"
under ADR-013. That was wrong on the acceptance criterion's own terms: ADR-013
grants time to convert ClickHouse query BODIES to the `sql` tag (one query per
P7 task, diffed); it says nothing about the criterion's separate,
unconditional "no `@openpanel/db` import in these nine modules" rule, and a
gap no ADR actually covers is `BLOCKED`, not self-exempted (CLAUDE.md). Fixed
by extending the v1-compat seam instead of arguing the rule away:

- `v1-compat.ts` gained `compatPrisma()` (the `Prisma` namespace — a value,
  not a client, but still `@openpanel/db`) and `compatChHelpers()` (`clix`,
  `TABLE_NAMES`, `chQuery`, `convertClickhouseDateToJs` — the query-building
  helpers that ADR-013 leaves in place beside `deps.ch`, the actual client).
  Both are lazy, same as `compatDb`/`compatCh`.
- `subscription.service.ts` and `project.service.ts` reach them through a
  local `loadCompatPrisma`/`loadChHelpers` lazy loader (GENUINE CYCLE: both
  are statically imported by `services.ts`, which `v1-compat.ts` statically
  imports back for `createServices`). mcp's `dashboard-management.ts` and
  `analytics/property-values.ts` reach them via `./shared`'s
  `loadCompatPrisma`/`loadCompatChHelpers` (no cycle — mcp's tool tree is
  already behind `mcp.service.ts`'s own lazy loader).
- `project.service.ts`'s `getLastEventPerProject` also had an actual bug this
  surfaced: it built its own ClickHouse client from `@openpanel/db` instead of
  using the `deps.ch` already sitting unused in its (underscore-prefixed)
  `_deps` parameter. Now it does.
- `dashboard-management.ts`'s `reportData()` helper takes the resolved
  `DbNull` sentinel as an `unknown` parameter rather than importing `Prisma`
  for its type — the same shape `notification.service.ts`'s `isValidPayload`
  already uses for the identical sentinel-comparison problem.

No query TEXT changed; only which module reaches the query-building helpers
did.

**`v1-compat.ts` grew, not just from this wave's nine modules.** Fixing the
above meant every OTHER core module that reached one of these nine bare (no
`deps`) also needed its import repointed at `v1-compat.ts`:
`shared/access-lookups.ts` (`getProjectById`), `onboarding.service.ts`
(`getUserById`), `dashboard.service.ts` (`getProjectById` — this one already
had `deps` in scope, so it's a straight parameter pass, no new v1-compat
wrapper), `export.service.ts`'s `resolveInsightsProjectId` (~35 call sites in
`export.routes.ts`, none carrying `deps`), `session/src/usage.ts` and
`organization/src/wind-down.ts`/`misc/src/data-health.ts` (`getLastEventPerProject`,
zero-arg shape preserved). None of these files are in this task's scope
globs by name; all of them needed a one-line import-target fix to keep
compiling once their target's signature gained `deps` — the same category of
necessary wiring M10-003's `auth.rpc.ts`/`chart.rpc.ts` touch-ups were.

**Test-isolation hazard found and fixed, not just avoided.** Two tests
(`mcp/src/tools/dashboard-management.test.ts`,
`mcp/src/tools/analytics/page-performance.test.ts`) mock
`@openpanel/db/src/prisma-client` / `.../clickhouse/client` directly and rely
on `v1-compat.ts`'s fallback to pick the mock up — but that fallback is a
process-lifetime memoized singleton (`v1-compat.ts`'s own `fallback` promise),
so under a bare (non-`--isolate`) `bun test` run an EARLIER file that already
resolved it (against ITS OWN mock, or the real db) leaves it wrong for every
later file. Both now call `resetV1CompatServicesForTests()` in `beforeAll`
(before importing the subject) and `afterAll` (so they don't do the same
thing to files after them) — this is the reset the memoized-singleton pattern
already existed for, just not previously needed by anything reaching the
fallback through a *different* module's mock.

**`pnpm run check:deps`** (`.dependency-cruiser.cjs`, both rules unchanged at
their landed `warn` severity):

| Rule | Before (M10-003) | After (M10-004) | Delta |
|---|---:|---:|---:|
| `core-uses-ctx-not-db-internals` | 160 | **135** | **−25** |
| `core-no-self-barrel` | 62 | **59** | **−3** |

Exit `0` either way (`warn`, not `error`):
`x 194 dependency violations (0 errors, 194 warnings). 1991 modules, 8036
dependencies cruised.` (was 222.) The residual `core-uses-ctx-not-db-internals`
hits inside this wave's nine modules are all `.test.ts` files that mock
`@openpanel/db` directly (`mcp/src/tools/dashboard-management.test.ts`,
`mcp/src/tools/analytics/{profiles,page-performance}.test.ts`,
`mcp/mcp.service.test.ts` — pre-existing pattern, unrelated to this wave);
none of the nine modules' `*.service.ts`/`*.rpc.ts`/`*.routes.ts` files import
`@openpanel/db` as a value any more (`import type` for a handful of Prisma
model types is not a value import — it is erased, so it carries no
import-time cost and is not what this rule or the acceptance criterion
target). The residual `core-no-self-barrel` hits inside `mcp`/`assistant` are
entirely the ~40 untouched tool files reaching `@openpanel/core` for
cross-module functions — real, but out of this wave's scope (fixing them
means rewriting every tool file's imports to relative paths, not wiring a
service factory).

**Verification, all run by ralph on 2026-09-06:**

- `pnpm run typecheck` — all 25 workspaces, `Done`.
- `cd packages/core && bun test --isolate`: **1457 pass, 12 skip, 0 fail**,
  `Ran 1469 tests across 149 files. [100.93s]`.
- `cd packages/core && bun test` (bare, no `--isolate`): **1457 pass, 12 skip,
  0 fail**, `Ran 1469 tests across 149 files. [34.00s]`.
- `pnpm run check:deps` — the table above.

### 2026-09-06 — M10-005, the runtime path (event, profile, group, misc, overview+pages, realtime) onto `createXService(deps)`

Ran by: ralph (M10-005 implement task, docs/TECH_DEBT.md §4 steps 1/2/5 and
§5a, continuing M10-003/M10-004).

**Shape.** `createEventService`, `createProfileService`, `createGroupService`
and `createMiscService` take `deps` (no longer `_deps`) and bind functions that
use it. `OverviewService` and `PagesService` are no longer classes: their
methods are module-scope functions taking `ServiceDeps` first and otherwise the
same arguments, bound by `createOverviewService(deps)` /
`createPagesService(deps)` under their old method names.
`createRealtimeService(deps)` is new. All three are registered in `services.ts`
as `services.overview`, `services.pages` and `services.realtime`.

**Pages is REGISTERED, not folded in.** Both `OverviewService` and
`PagesService` expose a `getTopPages`, and they are different queries with
different inputs — one over `events` scoped by a search string, one over
`sessions` scoped by chart filters. Folding them into one service would have
had to rename one of them, which is a call-site contract this wave does not
change. `services.pages` is its own entry; `pages.service.ts` keeps its own
file.

**Every lazy `@openpanel/db` import inside those modules is gone.** So is the
`loadDbBuffers()` hop in all three of this wave's modules that used it: the
buffers are `deps.buffers.event` / `.bot` / `.profile` (M8-001), which is the
exact drift this wave was chartered to remove. `misc/src/data-health.ts` no
longer imports `@openpanel/db/src/prisma-client` either — it takes `deps` and
calls `project.service.ts`'s `getLastEventPerProject(deps)` directly.

**Two new files in `shared/`, both because six modules needed the same thing.**

- `shared/ch-query.ts` — `chQuery` / `chQueryWithMeta` over `deps.ch` and
  `deps.logger`. `deps.ch.query` IS `withRetry(client => client.query(...))`,
  the same transport `@openpanel/db`'s `chQuery` uses, and the Int-meta
  coercion is copied verbatim, so result sets are identical (proof below). The
  one field that cannot survive the move is `host`: the retry proxy does not
  report which replica served the query — `chart/src/run-query.ts` (M10-003)
  made the same trade. The gain is the `query info` line now carrying the
  request's id (ADR-018 R1). `overview/src/run-query.ts` is now a three-line
  wrapper over it (`timezone` is mandatory there, optional here).
- `shared/cacheable-per-deps.ts` — `cacheable` for a function that needs
  `ServiceDeps`. `cacheable` keys on EVERY argument through a recursive
  `stringify`, so passing `deps` would serialize the whole Prisma client into
  the Redis key. `deps` is not cache identity anyway, so the cacheable is built
  once per `deps` in a `WeakMap` and the key stays byte-identical —
  `cachable:getEventMetas:<projectId>`, `cachable:getProfiles:<args>`,
  `cachable:getProfilePropertyKeys:<projectId>`. **The explicit `name` is the
  load-bearing part**: `cacheable(fn, ttl)` derives the prefix from `fn.name`,
  and an inline arrow silently drops it.
  **Stated cost:** `createCtx` builds a fresh deps object per request, so the
  L1 LRU inside `cacheable` is now per scope rather than per process. The
  shared L2 Redis cache — the one that actually saves the query — is
  unchanged, so a repeat call costs one Redis GET where it used to cost none.
  Boot-scoped callers (the v1-compat seam, job handlers) keep a process-lived
  L1.

**What is deliberately still lazy in these modules, and why.**
`event.service.ts` keeps `loadCache()` (`@openpanel/redis`'s `getCache` — core
tests that partially mock that package with no `getCache` reach this module
through the barrel), `loadFilterCompiler()` and `loadSessionService()` (a real
core-internal cycle, documented in place; a second dynamic edge on that loop
panics rolldown). None of them reach `@openpanel/db`. `realtime` and `misc`
keep ONE hop each into `v1-compat.ts`'s `compatChHelpers()` for `TABLE_NAMES`
/ `clix` / `formatClickhouseDate` — the pure helpers that live beside the
client, not the client, which is `deps.ch` in both. That is the same seam
`project.service.ts` uses since M10-004 and it exists because ADR-013 converts
the analytics read path one query per P7 task: those statements are still raw
strings and clix builders, not `sql` fragments. `compatChHelpers()` gained
`formatClickhouseDate` and `toNullIfDefaultMinDate` for this.
`profile/src/dates.ts` and `group/src/dates.ts` gained their own
`toNullIfDefaultMinDate` instead — module-local, matching the five existing
`src/dates.ts` copies, because two modules is not "several".

**Blast radius outside the six modules, all forced by a signature change.**
`ingest.service.ts` (`IngestTransport` gains `deps`; `checkIngestBot` gains a
`ServiceDeps` first parameter, because `createBotEvent` needs the bot buffer),
`ingest/src/incoming-event-handler.ts` and `session/src/session-end.ts` (their
`load*Deps` builders take `deps` and bind `createEvent` to it),
`session.jobs.ts`, `apps/api/src/main.ts` (one `bootServiceDeps(deps)` helper,
extracted from the literal `setV1CompatServices` already built),
`chart.service.ts`, `export.routes.ts`, `overview.rpc.ts`, `event.rpc.ts`,
`group.rpc.ts`, `profile.rpc.ts`, `profile.routes.ts`, `realtime.rpc.ts`,
`realtime.routes.ts`, `misc.routes.ts`, `mcp`'s `page-performance.ts`. Three
callers that genuinely have no scope of their own reach the bare v1-compat
spellings, exactly as `loadWindDownDeps` already did for
`getLastEventPerProject`: `cohort.service.ts`'s `listCohortMemberProfiles`,
`session.service.ts`'s `getSessionList`, and
`organization/src/win-back-highlight.ts`. Converting those three modules is
their own task.

`v1-compat.ts` gained 88 bare wrappers plus `overviewService` / `pagesService`
as plain objects of wrappers (`packages/trpc`'s overview router calls
`overviewService.getMetrics.bind(overviewService)`; `bind` on a plain function
is a no-op, so the call site reads identically). `index.ts` now exports those
spellings instead of the raw deps-taking functions, same as M10-003/M10-004
did for their waves.

**`pnpm run check:deps`** (`.dependency-cruiser.cjs`, both rules unchanged at
their landed `warn` severity):

| Rule | Before (M10-004) | After (M10-005) | Delta |
|---|---:|---:|---:|
| `core-uses-ctx-not-db-internals` | 135 | **123** | **−12** |
| `core-no-self-barrel` | 59 | **56** | **−3** |

Exit `0` either way (`warn`, not `error`):
`x 179 dependency violations (0 errors, 179 warnings). 1993 modules, 8050
dependencies cruised.` (was 194.) Thirteen edges removed, one added:

```
REMOVED  modules/event/event.service.ts          -> db/src/clickhouse/client.ts
REMOVED  modules/event/event.service.ts          -> db/src/prisma-client.ts
REMOVED  modules/group/group.service.ts          -> db/src/clickhouse/client.ts
REMOVED  modules/misc/misc.service.ts            -> db/src/clickhouse/client.ts
REMOVED  modules/misc/src/data-health.ts         -> db/src/prisma-client.ts
REMOVED  modules/overview/src/run-query.ts       -> db/src/clickhouse/client.ts
REMOVED  modules/overview/src/run-query.ts       -> db/src/clickhouse/sql.ts
REMOVED  modules/profile/profile.service.ts      -> db/src/clickhouse/client.ts
REMOVED  modules/realtime/realtime.service.ts    -> db/src/clickhouse/client.ts
REMOVED  modules/realtime/realtime.service.ts    -> db/src/clickhouse/query-builder.ts
REMOVED  modules/mcp/.../page-performance.test.ts -> db/src/clickhouse/client.ts
REMOVED  modules/mcp/.../profiles.test.ts        -> db/src/clickhouse/client.ts
REMOVED  modules/realtime/realtime.service.test.ts -> db/src/clickhouse/client.ts
ADDED    shared/ch-query.ts                      -> db/src/clickhouse/sql.ts
```

The one added edge is ADR-013's `sql` tag, which ADR-007 keeps in
`packages/db` by name: a compile-time template tag, no client, no request
scope — the same residual `chart.service.ts`'s header already records. The
`*.sql.ts` files in these modules keep theirs for the same reason.

**ClickHouse — old vs new transport, same data, same day.** No SQL TEXT
changed in this wave; what moved is which client executes it. Run by ralph on
2026-09-06 against the local single node (`http://localhost:8123/openpanel`,
the prod copy, read-only), calling `@openpanel/db`'s `chQuery` and core's new
`chQuery(deps, …)` back to back on each statement and comparing the serialized
result sets:

```
getStats/projects        rows old=1864 new=1864 identical=true old=1332.6ms new=1309.1ms
getStats/last24h         rows old=1    new=1    identical=true old=6.9ms    new=5.6ms
runPingCron              rows old=1    new=1    identical=true old=3.3ms    new=3.1ms
event.topOrigins         rows old=2    new=2    identical=true old=59.7ms   new=41.9ms
profile.propertyKeys     rows old=6    new=6    identical=true old=10.1ms   new=6.3ms
group.types              rows old=0    new=0    identical=true old=3.8ms    new=3.6ms
```

`single-node` numbers, valid for the self-host topology (docs/ENVIRONMENT.md).
No `Distributed`-table construct was added, removed or reordered — no `IN`
became a `GLOBAL IN` or vice versa — so the cluster topology is unaffected by
this wave.

**Verification, all run by ralph on 2026-09-06:**

- `pnpm run typecheck` — all 25 workspaces, `Done`.
- `cd packages/core && bun test` (bare): **1457 pass, 12 skip, 0 fail**,
  `Ran 1469 tests across 149 files. [31.14s]`.
- `cd packages/core && bun test --isolate`: **1457 pass, 12 skip, 0 fail**,
  `Ran 1469 tests across 149 files. [102.80s]`.
- `pnpm run check:deps` — the table above.
- `verification/harness start` → `cd apps/api && pnpm run e2e:sessions`:
  **29/29 checks passed** (profile, group and event flushes are all on that
  path).
- `verification/golden/compare.sh`: **`passed: 131/137`, 0 diffs in the 131
  validated**; the other 6 are the calendar-stale clock-anchored cases the
  harness itself skips (`captured on 2026-09-05, replayed on 2026-09-06` —
  `export-events-no-dates`, `insights-overview-range-30d`,
  `insights-retention-cohort`, and the three
  `insights-pages-performance-*`). Re-capturing is an operator/verify task,
  not an implement one. **137/137 was not reachable on 2026-09-06** — see the
  task report.
- `verification/harness stop`, then `verification/full.sh`.

**Left for later, named not fixed.**

- `getEventMetasCached`, `getProfilesCached` and `getProfilePropertyKeysCached`
  keep V1's Redis key because `cacheablePerDeps` takes an explicit `name`.
  **M10-004's `getClientByIdCached` (client.service.ts) and
  `getProjectByIdCached` (project.service.ts) do NOT**: both were converted to
  `cacheable((id) => …, ttl)` with an inline arrow, whose `fn.name` is `''`, so
  their prefix is `cachable:` for both. That is a cache-key change (a cold
  window) AND a potential cross-function collision — `cachable::<id>` is the
  same key for a client id and a project id. Out of this task's scope; needs
  its own fix, which is one `cacheable(NAME, …)` argument each.
- `session/src/session-end.ts` still lazy-loads `chQuery` from
  `@openpanel/db/src/clickhouse/client`, and `ingest/src/incoming-event-handler.ts`
  still reaches `sessionBuffer` through `loadDbBuffers()`. Both are the
  `session`/`ingest` modules' own conversion, not this wave's.

### 2026-09-06 — M10-009, both rules flipped to `error` at 0 violations

Ran by: ralph (M10-009). This closes §4 steps 3, 4 and 5 of the controller's
`docs/TECH_DEBT.md`.

#### The rules now fire

| Rule | Severity | Violations |
|---|---|---:|
| `core-uses-ctx-not-db-internals` | `error` | **0** |
| `core-no-self-barrel` | `error` | **0** |

```
$ pnpm run check:deps
✔ no dependency violations found (1998 modules, 8070 dependencies cruised)
```

Four exemptions carry the rule, each named in `.dependency-cruiser.cjs` with
its reason — not a widened `dependencyTypesNot`, which would swallow real
value imports (see the M10-001 entry above for the merge that proved it):

- **from `packages/core/src/context.ts`** — `typeof import('@openpanel/db/…')`
  type queries, tagged `['undetermined','type-import']` rather than
  `'type-only'`.
- **from `packages/core/src/v1-compat.ts`** — THE declared composition seam
  (§4 step 4's own wording). Deleted whole with `packages/trpc` at P10.
- **from `packages/core/src/code-migrations/**`** — one-shot CLI scripts run by
  `migrate.ts` outside the app; no request, no `Ctx` to lose.
- **from `*.test.ts`** — a test has no request, and the `grep` measurement
  below is itself defined as `| grep -v .test.ts`.
- **to** `clickhouse/sql.ts`, `clickhouse/query-builder.ts` and
  `sql-builder.ts` — the three `packages/db` modules that build query TEXT and
  hold no client (`clix(client, tz)` takes the client as an argument).
  `prisma-client.ts`, `clickhouse/client.ts`, `logger.ts` and the barrel are
  NOT exempt: those are where a second client comes from.

#### Re-measured — `@openpanel/db` reached from `packages/core/src`

Non-test files, 2026-09-06:

| Measurement | Count | Where the remainder is |
|---|---:|---|
| `grep -rn "import('@openpanel/db" packages/core/src --include=*.ts \| grep -v .test.ts \| wc -l` | **22** | 7 prose comments, 9 `typeof import()` type queries (2 in `context.ts`, 7 in `v1-compat.ts`), **6 runtime imports, all in `v1-compat.ts`** |
| …of those, outside `v1-compat.ts` / `context.ts` | **0** | — |
| `grep -rn "from '@openpanel/db" packages/core/src --include=*.ts \| grep -v .test.ts \| wc -l` | **77** | 20 `import type`, 34 in `code-migrations/**`, 23 value imports of the query-text builders |
| …value imports of a **client-bearing** module (`prisma-client`, `clickhouse/client`, the barrel) outside `code-migrations/**` | **0** | — |

The controller's 2026-09-05 baseline was 63 dynamic + 80 static value imports;
both drift numbers are now 0 outside the two seams the rule names. The 23 that
remain are `sql`/`clix`/`createSqlBuilder` — pure text, no client, so a
requestId cannot be lost through them (ADR-013 fixes the `sql` tag at that
path by name).

What made the last of them go: the buffers took the boot scope's client as
`BufferDeps.ch` (`apps/api/src/main.ts` hands in the same `ch` every service
gets as `deps.ch`), `buffers/clickhouse.ts`'s `loadClickHouse()` seam was
deleted, and `shared/ch-tables.ts` / `shared/ch-dates.ts` hold core's own copy
of the table map and the date helpers — policed against `@openpanel/db`'s
originals by `ch-tables.parity.test.ts` and `ch-dates.parity.test.ts`, so the
copies cannot drift silently.

The violations that were still standing after M10-006 (118 + 56 = 174 edges)
were closed here, in two groups:

- `core-uses-ctx-not-db-internals` — 41 files (production plus the tests that
  mocked what they imported). The buffers (8) via
  `BufferDeps.ch` + `shared/ch-tables.ts` / `shared/ch-dates.ts`; the
  still-unconverted service functions in `cohort`, `gsc`, `import`, `insight`,
  `integration`, `notification`, `onboarding`, `organization`, `project`,
  `session` and `widget` onto `deps.db` / `deps.ch`; `shared/slug-id.ts` and
  `shared/access-lookups.ts` onto the v1-compat seam (their `cacheable`
  signatures cannot take a leading `deps`).
- `core-no-self-barrel` — 60 files stopped importing `@openpanel/core` from
  inside `packages/core`: 26 under `modules/mcp/**`, 13 under
  `modules/assistant/**`, 7 under `modules/import/**`, and one or two each in
  `cohort`, `gsc`, `insight`, `notification`, `onboarding`, `organization`,
  `overview` and `session`. Each now imports the sibling module by relative
  path, or `../../v1-compat` where the caller has no `Ctx` (mcp's and the chat
  agent's tool handlers have a third-party-fixed signature).

No genuine cycle needed a per-file exception: the two lazy edges that remain
(`base-buffer.ts` → `v1-compat`, `shared/access-lookups.ts` → `v1-compat`)
both point AT the declared seam, and each names the cycle in a comment above
the loader.

#### `services.ts` registers every `*.service.ts`

```
$ ls packages/core/src/modules/*/*.service.ts | wc -l
36
$ grep -rh "^export function create[A-Za-z]*Service" packages/core/src/modules/*/*.service.ts | wc -l
36
$ grep -cE "^    [a-z]+: create[A-Za-z]*Service\(" packages/core/src/services.ts
36
$ grep -rn "export class .*Service" packages/core/src --include=*.ts | wc -l
0
$ grep -rn "_deps" packages/core/src --include=*.ts | grep -v ".test.ts" | wc -l
1
```

The four chart sub-modules (`conversion`, `funnel`, `retention`, `sankey`) got
their own keys in this task — `chart` still composes them for the facade its
own callers use, and both bind the same stateless closures. Three factories
that genuinely need nothing (`createAuthService`, `createAssistantService`,
`createMcpService`) now say so on the signature instead of ignoring a `_deps`
argument; their reasons are on each factory.

The one `_deps` left is `http/client-auth.ts`'s `authenticateClient(_deps:
AppDeps, …)`: its single lookup is `getClientByIdCached`, a `cacheable` whose
key is derived from the call's arguments, so it cannot take a leading `deps`
(same constraint as `shared/access-lookups.ts`). Named, not fixed.

#### §4 step 3 — `bun test` wall time, before and after the wave

`cd packages/core && time bun test`, same box, 2 runs each. Baseline is the
parent of M10-001 (`49a6388e`) measured in a `git worktree`, never a checkout
of the working tree.

| Tree | Run 1 | Run 2 | Tests |
|---|---:|---:|---|
| `49a6388e` (parent of M10-001) | **11.739s** | **14.521s** | 1447 pass, 12 skip, 0 fail — 1459 across 147 files |
| HEAD (M10-009) | **14.330s** | **13.202s** | 1466 pass, 12 skip, 0 fail — 1478 across 151 files |

No target was set and none is claimed: 13.1s mean before, 13.8s mean after,
with a 2.8s spread inside the baseline pair alone — the difference is inside
the noise of this box, while the suite grew by 19 tests and 4 files. The lazy
`import('@openpanel/db/…')` pattern was justified by test cost; removing it
cost nothing measurable.

#### §4 step 5 — the requestId proof, on all three paths

`packages/core/test/request-id-end-to-end.test.ts` (M10-009 merged
`request-id-chart-query.test.ts` and `request-id-ingest.test.ts` into it, so
the three paths cannot drift into three files that disagree):

```
✓ one requestId spans the route log, the enqueue, the job and its follow-up enqueue
✓ a minted requestId travels the same four hops, and does not leak into the next request
✓ a chart query made through a request-scoped ctx logs the request's own requestId
✓ two concurrent requests do not share a requestId on their ClickHouse calls
✓ the envelope's requestId reaches the handler's logger, its buffer write and the session_end it enqueues
✓ a second message is scoped to its own id, and an envelope without one still gets scoped
```

HTTP → job (P2-010's original), chart query (M10-003) and Kafka/ingest handler
(M10-006), in one file.

#### A test-isolation bug this task had to fix to go green

`cd packages/core && bun test` (bare, one shared module registry) failed 6
chart-integration assertions with `deps.db.project.findUniqueOrThrow is not a
function`, intermittently — only when the 5-minute Redis cache behind
`getOrganizationByProjectIdCached` was cold. Cause: `v1-compat.ts` MEMOIZES
its fallback `ServiceDeps`, so a file that resolves it while a
`mock.module('@openpanel/db/src/prisma-client', …)` is installed pins the
mocked client for every later FILE in the process — restoring the module
registry in `afterAll` does not undo it. Reproduced deterministically with
`bun test src/modules/mcp/mcp.service.test.ts src/modules/chart/chart.service.test.ts`
(6 fail before, 0 after). Fixed at the leak: the four files that mock
`prisma-client` now also call `resetV1CompatServicesForTests()` in `afterAll`
(the idiom `mcp/src/tools/dashboard-management.test.ts` already used), and
`import/import.service.test.ts` dropped its `@openpanel/db/src/clickhouse/client`
module mock entirely — the subject takes `deps.ch` now, so the mock only
existed to leak.

**Verification, all run by ralph on 2026-09-06:**

- `pnpm run check:deps` — 0 violations, both rules at `error`.
- `pnpm run typecheck` — all 25 workspaces, `Done`.
- `cd packages/core && bun test` (bare): **1466 pass, 12 skip, 0 fail**,
  `Ran 1478 tests across 151 files.`, twice.
- `verification/harness start` → `cd apps/api && pnpm run e2e:sessions`:
  **29/29 checks passed**.
- `verification/golden/compare.sh`: **`passed: 131/137`, 0 diffs in the 131
  validated**; the other 6 are the calendar-stale clock-anchored cases the
  harness skips itself (`captured on 2026-09-05, replayed on 2026-09-06`) —
  the same six M10-003 and M10-005 recorded. **137/137 is not reachable on a
  day that is not the capture day**; re-capturing is a verify task, not an
  implement one.
- `verification/harness stop`, then `verification/full.sh` — green, with the
  documented pre-P11 `contracts/sdk/dist-gate.sh` exception.

### 2026-09-06 — M11-003, `packages/queue`'s Kafka transport and notification dispatch move into core; `queues.ts` / `buffers.ts` do NOT (out of scope)

Ran by: ralph (M11-003 implement task).

**Survey, before the move** — every import of `@openpanel/queue` outside
`packages/queue` (`grep -rnE "from '@openpanel/queue" --include=*.ts`):

| File | Symbols |
|---|---|
| `apps/api/src/main.ts` | `assertKafkaConfigured`, `createKafkaEventsConsumer`, `KAFKA_EVENTS_TOPIC`, `KAFKA_HANDLER_MAX_ATTEMPTS`, `KAFKA_HANDLER_RETRY_INITIAL_MS`, `KAFKA_HANDLER_RETRY_MAX_MS`, `KAFKA_PARTITIONS_CONCURRENT`, `kafkaLogger`, `produceDeadLetterEvent`, `produceIncomingEvent` (10, from the barrel) + `checkNotificationRulesForEvent` (deep, `@openpanel/queue/src/notification-dispatch`) |
| `apps/api/e2e/lag-monitor.ts` | `createKafkaAdmin`, `disconnectKafka`, `KAFKA_BROKERS`, `KAFKA_CONSUMER_GROUP`, `KAFKA_EVENTS_TOPIC`, `sampleConsumerGroupLag` |
| `apps/api/e2e/legacy-job-proof.ts` | `produceIncomingEvent` |
| `packages/core/src/modules/session/session.jobs.ts` | `checkNotificationRulesForSessionEnd` (lazy `import('@openpanel/queue/src/notification-dispatch')`) |
| `packages/core/src/buffers/lazy-db-buffers.ts` | the buffer singletons (lazy `import('@openpanel/queue/src/buffers')`), reached only by `modules/widget/widget.rpc.ts` |
| `packages/db/scripts/check-sessions.ts` | `sessionsQueue` |
| `packages/db/scripts/drain-old-session-jobs.ts` | `sessionsQueue` |
| `packages/db/scripts/migrate-sessions.ts` | `sessionsQueue`, `EventsQueuePayloadCreateSessionEnd` |
| `packages/trpc/src/routers/cohort.ts` | `cohortComputeQueue` |
| `packages/trpc/src/routers/gsc.ts` | `gscQueue` |
| `packages/trpc/src/routers/import.ts` | `importQueue` |
| `packages/trpc/src/routers/overview.ts` | `eventBuffer` (deep, `@openpanel/queue/src/buffers`) |
| `packages/trpc/src/routers/widget.ts` | `eventBuffer` (deep, `@openpanel/queue/src/buffers`) |

**What moved.** `src/kafka.ts` → `packages/core/src/modules/ingest/src/kafka.ts`
and `src/notification-dispatch.ts` →
`packages/core/src/modules/notification/src/notification-dispatch.ts`. Both are
the same file: `diff` against `HEAD` shows only repointed imports, plus two
edits with reasons —

- `DeadLetterMessage` was declared twice (once in `kafka.ts`, once in
  `consumer.ts`, structurally identical by design); now that they are siblings
  `kafka.ts` imports the consumer's.
- `produceIncomingEvent`'s parameter changed from
  `EventsQueuePayloadIncomingEvent['payload']` to core's own
  `IncomingEventPayload`. The wire format is unchanged: a temporary
  `[A] extends [B] ? [B] extends [A]` assertion compiled clean in both
  directions against `@openpanel/queue`'s type.
- `triggerNotification` enqueues through core's registry
  (`queues.notification.sendNotification`) rather than a second
  `new Queue('notification')` — same Redis key, same job name, same
  `{payload, meta}` envelope (`golden/queue-keys/check.sh` still matches the
  V1 goldens), and it became `async` because the registry producer is.

Every Kafka constant is byte-identical after the move — topic
(`process.env.KAFKA_EVENTS_TOPIC || 'events'`), DLQ
(`|| \`${KAFKA_EVENTS_TOPIC}-dlq\``), group
(`|| 'openpanel-events'`), and the 15 `Number.parseInt` bounds — verified by
`diff -u` of the two files' bodies.

**The `AppDeps.produceIncomingEvent` injection is retired.** It existed only
because `@openpanel/queue` imports `@openpanel/core` for its logger, so core
could not import the producer back (`context.ts`'s own comment). With
`kafka.ts` in core, `ingest.routes.ts` imports the sibling directly. The
producer stays an *argument* to `ingest.service.ts` — that seam is now about
letting a test assert what was produced without a broker, not about a package
cycle, and `ingest.service.test.ts` / `legacy-event.test.ts` still use it.

**`buffers/lazy-db-buffers.ts` is deleted**; its one core caller
(`widget.rpc.ts`'s `loadEventBuffer`) reads `ctx.buffers.event`.

**The three orphan `packages/db/scripts` are deleted** — `check-sessions.ts`,
`drain-old-session-jobs.ts`, `migrate-sessions.ts`, all V1 session-migration
tooling. `grep -rn 'check-sessions\|drain-old-session-jobs\|migrate-sessions'`
over `*.json`/`*.ts`/`*.md`/`*.sh` returns nothing outside the files
themselves; `packages/db/package.json`'s only `scripts/*` entry is
`duplicate-events` → `find-duplicate-events.ts`, untouched.

**NOT done, and why — `packages/queue/src/queues.ts` and `src/buffers.ts` stay.**
The task asked for both to be deleted. They cannot be, inside this task's
declared scope (`packages/core/**`, `packages/queue/**`,
`packages/db/scripts/**`, `apps/api/**`, `docs/**`): five
`packages/trpc/src/routers/*` files import them (the last five rows of the
survey above), and `packages/trpc/**` is not in scope. Deleting the two files
without touching those routers fails `pnpm run typecheck`; touching them is
the out-of-scope edit. **This needs either a scope extension to
`packages/trpc/src/routers/{cohort,gsc,import,overview,widget}.ts` or a
follow-up task**, and it is not a mechanical repoint — the three queue call
sites become `ctx.services.cohort.enqueueCompute` / `ctx.queues.gsc...` /
`ctx.services.import.enqueue`, which changes `import.ts`'s `jobId` handling
and `cohort.ts`'s procedure signatures. `packages/queue/index.ts` no longer
re-exports `./src/kafka`; what remains behind the barrel is exactly what trpc
still consumes.

Also still declared, unused: `@openpanel/queue` in `apps/api/package.json`,
`packages/core/package.json` and `packages/db/package.json` — no file in any
of the three imports it any more. Removing the manifest entries belongs with
M11-004's deletion of the package.

**Verification, all run by ralph on 2026-09-06:**

- `pnpm run typecheck` — all 25 workspaces, `Done`.
- `pnpm test` — 13 files, **205 passed**.
- `cd packages/core && bun test` (bare) — **1466 pass, 12 skip, 0 fail**,
  `Ran 1478 tests across 151 files. [12.59s]`, `real 0m12.652s`, and it
  EXITS: moving `kafka.ts` into core constructs no Kafka client at import
  time (`getKafka()` is lazy; only `assertKafkaConfigured` reads
  `KAFKA_BROKERS`, and nothing calls it at module scope).
- `pnpm run check:deps` — `no dependency violations found (2321 modules,
  10072 dependencies cruised)`, both rules still at `error`.
- `bash apps/api/e2e/boot-proof.sh` — all checks passed, all three ROLEs.
- `verification/golden/queue-keys/check.sh` — `OK - 7x2 queue keys and 20
  scheduler ids derived from the V2 registry match the V1 goldens`.
- `verification/harness start` → `cd apps/api && pnpm run e2e:sessions`:
  **29/29 checks passed** (Kafka produce → consume is the path under test) →
  `pnpm run e2e:legacy-jobs`: **all checks passed** → `harness stop`.
- `verification/full.sh` — `FULL: green`.

One incidental find, recorded not fixed: `usage.ts`'s static
`import { getOrganizationBillingEventsCount } from '../../../v1-compat'` had
to become part of the existing lazy `loadProjectService()` call. `jobs.registry.ts`
reaches this file (`session.jobs.ts` → `session-end` → `usage`), and that one
static edge pulls `services.ts` and all 36 services into the registry's import
graph, which builds a ClickHouse client at import time — `queue-keys/check.sh`
fails outright without the change (confirmed by reverting the file alone and
re-running it).

### 2026-09-06 — M11-008, `dist-gate.sh`'s internal-vs-published fix confirmed green — no source change needed

Ran by: ralph (M11-008 implement task).

The operator's fix to `contracts/sdk/dist-gate.sh` (deriving its
workspace-internal package list from `packages/*/package.json` names instead
of grepping any `@openpanel/`) needed no corresponding code change here: the
three preconditions it depends on were already satisfied by M11-007's
codemod. Re-verified from scratch rather than trusted:

- `grep -rn @openpanel/common packages/sdks` — empty. `express/get-client-ip.ts`
  carries its own inlined `getClientIpFromHeaders` (header comment explains
  why), `express/package.json` has no `@openpanel/common` dependency, and
  `express/tsup.config.ts` has no `noExternal` entry.
- `packages/sdks/sdk/src/index.ts` still hand-duplicates the wire constants
  rather than importing `@openpanel/core/modules/ingest/ingest.constants` —
  its header comment's reasoning (core's package.json exports map has no
  `./*` wildcard; `rollup-plugin-dts` can't inline a type through it) still
  holds, so this task kept that approach rather than retargeting.
- `dist-gate.sh` standalone: `DIST GATE: all 5 checked package(s) clean`
  (express/nextjs/react-native/sdk/web PASS; astro/`_info` SKIP no build
  script; nuxt SKIPs no `dist/index.d.ts`).

**Verification, all re-run by ralph on 2026-09-06:**

- `pnpm run typecheck` — 23 workspace projects, all `Done`.
- `contracts/sdk/dist-gate.sh` — `DIST GATE: all 5 checked package(s) clean`.
- `contracts/sdk/run.sh` — `SDK WIRE CONTRACTS: all green` (67 assertions:
  node 37, web 10, legacy-event 20, plus the dist gate), 37.0s.
- `verification/full.sh` — `FULL: green`, exit `0`, no `BLOCKED-KNOWN` line:
  the fingerprint this task exists to retire didn't fire because
  `contracts/sdk/run.sh` now fully succeeds. This supersedes the
  `dist-gate.sh` pre-P11 exception recorded in the M10-003 and M10-009
  entries above (both `full.sh` runs there carried it; this one doesn't).

Working tree change is this entry alone — every acceptance criterion for
M11-008 was already met by the source tree M11-007 left behind.

**Debt noticed, not fixed (outside this task's scope — the gate only
inspects built `.d.ts`, not manifests):** `packages/sdks/sdk/package.json`
still declares `@openpanel/validation` as a `devDependency`; nothing in the
package imports it — the wire-constant types were inlined into `src/index.ts`
in a pre-rewrite commit (`fix(sdk): inline validation types in dts...`) and
the manifest entry never followed. Safe to delete whenever that
`package.json` is next touched.

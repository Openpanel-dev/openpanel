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

### 2026-09-07 — M12-009, ADR-013 decision 21 closed: the builders are deleted and `sqlstring` is out of the repo

**RESOLVED: the "clix coexistence" exception.** ADR-013's P8 deletion had been
deferred since M7 and was last restated by `M9-CLEANUP-001` in
`packages/db/index.ts`:

> `clix` (query-builder.ts) and `createSqlBuilder` (sql-builder.ts) are dead
> per ADR-013, but 7 live call sites across @openpanel/core still import them
> directly and have not been converted onto the `sql` tag yet — see
> M9-CLEANUP-001's report. Deleting these two ahead of that conversion is
> BLOCKED, not done.

M12-002..008 emptied that import graph; M12-009 deleted the three files
(`git rm`), took the barrel comment with them, and removed `sqlstring` /
`@types/sqlstring` from every workspace that declared it (`packages/db`,
`packages/core`, `apps/start` — `apps/api` had already lost its copy). Both
sections of this register that cite `query-builder.ts` / `sql-builder.ts` as
exempt targets of `core-uses-ctx-not-db-internals` are now describing paths
that do not exist; `packages/db/src/clickhouse/sql.ts` is the only one left,
and it is also the one the rule keeps exempt.

**Final `bash tooling/gates/p12-grep-gates.sh --report`, ralph 2026-09-07:**

```
   sqlstring        clix sql-builder  file
----------------------------------------------------------------------------
----------------------------------------------------------------------------
           0           0           0  TOTAL
```

`--assert` exits `0`: `OK: sqlstring = 0, clix = 0, sql-builder = 0; all three
definer files are gone.`

**The leftovers M12-008 disclosed, converted here.** The gate read
`sqlstring 16 / clix 1 / sql-builder 1` on clean `30d236fa` (measured by
stashing this task's tree and re-running `--report`), spread over eight files:
`apps/start/package.json` 1, `packages/core/package.json` 2, `group-buffer.ts`
3, `profile-backfill-buffer.ts` 3, `profile-buffer.ts` 2,
`packages/db/package.json` 2, `packages/db/src/clickhouse/client.ts` 3, and
`packages/db/index.ts` 1 clix + 1 sql-builder. The gate does not scan
`packages/db/scripts/`, but the two scripts there imported `clix` and
`sqlstring` and had to convert too — removing the dependency removes the module
they import.

Every changed statement was executed against local ClickHouse in **both** forms
through the same `@clickhouse/client` — V1 as `query`, V2 as `query` +
`query_params` — on the same data. **8 statements, all IDENTICAL.** Full SQL,
params, row counts and timings: `packages/core/src/buffers/buffers.sql.proof.md`
and `packages/db/scripts/scripts.sql.proof.md`.

| Site | Statement | Rows | old → new |
|---|---|---:|---|
| `core/src/buffers/group-buffer.ts:84` | `SELECT … FROM groups FINAL` | 1 | 33ms → 8ms |
| `core/src/buffers/profile-buffer.ts:222` | batch fetch, no date filter | 2 | 20ms → 20ms |
| `core/src/buffers/profile-buffer.ts:222` | batch fetch, 2-day filter | 0 | 9ms → 8ms |
| `core/src/buffers/profile-backfill-buffer.ts:96` | lightweight `UPDATE … CASE` | 3 read back | 7ms → 6ms |
| `db/scripts/ch-update-sessions-with-revenue.ts:45` | `SELECT id FROM sessions` | 2 | 5ms → 5ms |
| `db/scripts/ch-update-sessions-with-revenue.ts:79` | `ALTER TABLE … UPDATE multiIf` | 4 read back | 11ms → 14ms |
| `db/scripts/ch-copy-from-remote.ts:95` | `SELECT * FROM remote(…)` | 2 | 7ms → 9ms |
| `db/scripts/ch-copy-from-remote.ts:97` | `INSERT … SELECT * FROM remote(…)` | 3 → 5 | 9ms → 9ms |

Reads ran against the local prod-copy `openpanel`; the two mutations and the
`INSERT` ran against a throwaway `m12009_scratch` database, dropped afterwards
— never against `openpanel` or `openpanel_test`. `remote()` accepts bound
params (`{p:String}` for the host and credentials, `{p:Identifier}` for the
database and table), verified before the conversion was written, which is what
takes the remote password out of the query text the script logs. No `IN` was
converted to `GLOBAL IN` or back: every `IN` touched takes a literal set, not
a subquery, so `docs/ENVIRONMENT.md`'s distributed-`IN` trap does not apply.

Timings are single-node and directional only (ClickHouse 26.1.3.52, 4 vCPU);
production is 2 shards × 2 replicas.

`packages/db/src/clickhouse/client.ts`'s `toDate(str, interval?)` was deleted
rather than converted: it existed only to `sqlstring.escape` a date-shaped
string into query text, it had zero importers in the repo, and keeping it
would have kept a manual-escaping helper alive that ADR-013 forbids.

**`packages/db/src/clickhouse/sql.ts` joined the barrel**, as its own header
promised. `packages/core` still reaches it by its deep path in all 55 files:
the barrel also re-exports `clickhouse/client.ts` and `prisma-client.ts`,
which construct a ClickHouse client array and a `PrismaClient` at module load,
so a barrel import from core acquires a second, request-scope-less client —
which is exactly what `.dependency-cruiser.cjs`'s
`core-uses-ctx-not-db-internals` forbids (its comment: "prisma-client.ts,
clickhouse/client.ts, logger.ts **and the barrel** are NOT exempt"). Nothing
outside `packages/core` imported the deep path.

**Debt noticed, not fixed (outside this task's scope — the file is at the repo
root, not under any of this task's scope globs):** `.dependency-cruiser.cjs`'s
`core-uses-ctx-not-db-internals` still exempts
`^packages/db/src/clickhouse/query-builder\.ts$` and
`^packages/db/src/sql-builder\.ts$` in its `to.pathNot`, and its comment still
explains both. They are dead regex branches now — harmless (nothing can match
them), but the next task that touches that file should delete both lines and
the two sentences describing them.

#### `packages/core/src/modules/chart/src/compiled.ts` — kept, with its caller census

M12-003 kept `compiled.ts` and its reviewer checked the reason: neither filter
compiler (`filter-where.ts`, `table-filter-where.ts`) nor the field resolver
(`field-resolution.ts`'s `getSelectPropertyKey`) returns anything that crosses
`compiledText` any more — they all return `SqlFragment`s — so what is left are
the chart builders splicing a name they generated themselves.
`compiledTextWithProfileRefs` was deleted outright at that time. That still
holds at M12-009: `compiled.ts` has **29 `compiledText(` splice sites on 27
lines across 8 files**, so it
is NOT deleted, and this is the census the M12-009 criterion asks for.

`compiledText` stays a named export in one file rather than a `sql.raw()`
scattered across the module precisely so this census is a grep:

```
$ grep -rn "compiledText(" packages/core/src --include=*.ts | grep -v '/compiled.ts:'
```

| file:line | what it splices | where the text comes from |
|---|---|---|
| `chart/src/chart.sql.ts:175` | a CTE name in `WITH <name> AS (…)` | keys of the `ctes` record the builder itself assembles — the profile CTE name and `` `cohort-<id>` `` (below) |
| `chart/src/chart.sql.ts:274` | the `"profile.<field>"` CTE alias | `field`, validated on the same line by `sql.id(field, PROFILE_CTE_FIELDS)` against a closed column set (`id`,
`properties`, plus `PROFILE_CTE_SCALAR_FIELDS`) |
| `chart/src/chart.sql.ts:340` | `` `cohort-<id>` `` as a JOIN target | `cohortId`, through `assertCohortId` (below) |
| `chart/src/chart.sql.ts:434` | `label_<n>` breakdown alias | `\`label_${index + 1}\`` — a loop index |
| `chart/src/chart.sql.ts:435` | the same `label_<n>` as a GROUP BY key | same |
| `chart/src/chart.sql.ts:469` | the aggregate keyword (`sum`/`avg`/`max`/`min`) | `MATH_FUNCTION_BY_SEGMENT[event.segment]` — a 4-entry literal `Record` at `chart.sql.ts:58`; an unknown segment yields `undefined`, not the input |
| `chart/src/chart.sql.ts:580` | `label_<n>` in a window `PARTITION BY` | a loop index |
| `chart/src/funnel.sql.ts:78` | `, 'strict_increase'` — the `windowFunnel` mode | `STRICT_INCREASE_MODE`, a file constant; the only branch is an env flag |
| `chart/src/funnel.sql.ts:188` | `b_<index>` breakdown alias | a loop index |
| `chart/src/funnel.sql.ts:307` | `b_<index>` as a GROUP BY key | a loop index |
| `chart/src/funnel.sql.ts:366` | `b_<index>` in SELECT and GROUP BY | a loop index |
| `chart/src/funnel.sql.ts:391` | `trim(ifNull(toString(b_<n>), ''))` | a loop index inside a fixed template; the compared VALUE beside it binds as `sql.string` |
| `chart/src/conversion.sql.ts:117` | `b_<index>` outer-select alias | a loop index |
| `chart/conversion.service.ts:137` | `b_<index>` alias | a loop index |
| `chart/src/retention.sql.ts:170` | `toDate` / `toStartOfWeek` / `toStartOfMonth` | `SQL_START_OF[interval]`, a 5-entry `Record` keyed by the `IRetentionInterval` union |
| `chart/src/retention.sql.ts:171` | the `dateDiff` / `INTERVAL` unit | `SQL_INTERVAL[interval]`, same shape |
| `chart/src/retention.sql.ts:172` | `>=` vs `=` | `COUNT_CRITERIA[criteria]`, keyed by the `IRetentionCriteria` union |
| `chart/src/retention.sql.ts:200` | `interval_<n>_users` alias | `String(index)` over `range(0..diffInterval)` |
| `chart/src/retention.sql.ts:206` | `interval_<n>_users` / `_user_count` | same |
| `chart/src/sankey.sql.ts:28` | the `arrayFilter(…) as events_deduped` expression | a file-level constant, no interpolation |
| `chart/src/sankey.sql.ts:38` | the `if(arrayFirstIndex(…))` truncation | a file-level constant, no interpolation |
| `chart/src/sankey.sql.ts:48` | the `arrayJoin(arrayMap(…))` transition subselect | a file-level constant, no interpolation |
| `chart/src/sankey.sql.ts:187` | `arraySlice(events, start_index, …)` | a file-level constant, no interpolation |
| `chart/src/sankey.sql.ts:201` (×2) | the base CTE name | `transitionsFrom`'s two callers pass the string literals `'session_paths_base'` and `'between_sessions'` |
| `overview/src/overview.sql.ts:115` | the `WITH FILL … STEP toInterval<Unit>(1)` step | `toIntervalStep(interval)`, a `switch` over the `IInterval` union that throws on anything else |
| `chart/src/field-resolution.ts:203` | `` `cohort-<id>` `` CTE name | `cohortId` — see below |
| `chart/src/field-resolution.ts:505` | `` `profile.properties.<key>` `` CTE alias | `key` — see below |

**Nothing above is a value, and nothing above is a compiler's output.** Every
row is an alias, a CTE name, a SQL keyword or a static expression. The two
compilers' and the resolver's outputs reach the statement as `SqlFragment`s and
never pass through `compiledText`.

**Two rows are name-shaped text derived from a user-chosen NAME, and are
flagged rather than buried** — they are the same two M12-003's reviewer read,
and both are guarded so that `compiledText` receives only a validated
identifier, never the raw input:

- **`` `cohort-<id>` ``** (`field-resolution.ts:203`, `chart.sql.ts:340`,
  and the `ctes` key at `chart.sql.ts:175`). `cohortId` comes from a saved
  report's breakdown config. `chart.sql.ts:119`'s `assertCohortId` tests it
  against `/^[A-Za-z0-9_-]+$/` and **throws `ChartCohortIdError`** otherwise —
  it never falls back to inlining, which is what ADR-013 R3 requires of an
  identifier path. The name needs the text seam because a dash makes `sql.id`
  reject it and `{x:Identifier}` is not accepted in a `WITH … AS` position.
  `field-resolution.ts:202`'s `getCohortCteName` has no in-repo caller today
  beyond the two barrel re-exports (`chart.service.ts:133`, `index.ts:338`);
  `chart.sql.ts` builds the same name behind `assertCohortId` itself.
- **`` `profile.properties.<key>` ``** (`field-resolution.ts:505`). `key` is
  the tail of a `profile.properties.<key>` field reference in the chart config.
  `collectProfilePropertyKeys` (`field-resolution.ts:465`, guard at `:484`)
  **rejects any key
  containing a backtick or a backslash** — the only two characters that are
  special inside a backtick-quoted ClickHouse identifier — and such keys are
  simply not narrowed: the full `properties` Map stays selected and their refs
  keep the Map access. The alias has three dot-separated parts, so `sql.id`
  cannot express it. The key's *value* twin on the same line binds normally
  (`properties[${sql.string(k)}]`).

Both are the identifier tier of ADR-013, implemented as a guard local to the
call site rather than through `sql.id`, because `sql.id`'s grammar (bare or
once-qualified, no dashes, no backticks) cannot spell either name. **If a
future task widens `sql.id` to accept a backtick-quoted, multi-part name,
these two rows and `compiled.ts` with them can go.** That is the standing exit
condition; recorded here, not done in M12-009 (out of its scope).

## Root scripts (M12-010)

Every `--filter <name>` in the root `package.json` verified against the
workspace it selects and the script that workspace actually exports.
`gen:bots` pointed at `api`, which has no such script — the generator has
always lived in `core`; fixed to match `gen:referrers`, which was already
correct. `dev` assumed a `testing` script existed on every dev-facing
workspace (a V1-era convention); only `apps/api` still has one, so
`pnpm -r --parallel testing` silently ran nothing but the API. Fixed to start
`apps/api` and `apps/start`'s dashboard explicitly, on non-colliding ports
(both default to 3000) — verified with a real 10s boot (Kafka consumer joined,
7 BullMQ workers started, cron upserted, Vite ready) and a clean `SIGTERM`
shutdown, 2026-09-07.

| Script | Target workspace(s) | Target script | Exists |
|---|---|---|---|
| `gen:bots` | `core` | `gen:bots` | yes |
| `gen:referrers` | `core` | `gen:referrers` | yes |
| `dev` | `api` (testing), `start` (dev) | `testing`, `dev` | yes |
| `dev:public` | `public` | `dev` | yes |
| `db:codegen` | `db` | `codegen` | yes |
| `codegen` | `db`, `core` | `codegen` (both) | yes |
| `migrate` | `db` | `migrate` | yes |
| `migrate:deploy` | `db` | `migrate:deploy` | yes |

`typecheck`, `check`, `check:workspace`, `check:deps` and `fix` run across the
whole workspace (`pnpm -r` / no filter) and name no specific package, so they
are not in this table.

## Test split (M12-011)

Measured on this box (4 cores, local Postgres/ClickHouse/Redis) by the agent
implementing M12-011, on 2026-09-07, at HEAD `bcf07cbc` with a clean tree.
Every number below is from a run recorded in this section — none is inherited.

### BEFORE

**`pnpm test`** (`vitest run`, root `vitest.workspace.ts` = `['packages/*','apps/*','!apps/start']`):
**7 files, 178 tests, 178 passed, 0 failed, 0 skipped — 10.19s.**

| Workspace | Files | Tests | Runner |
|---|---:|---:|---|
| `@openpanel/db` | 4 | 101 | vitest (own `vitest.config.ts` → `vitest.shared.ts`) |
| `@openpanel/api` | 1 | 13 | vitest (own `vitest.config.ts` → `vitest.shared.ts`) |
| `@openpanel/redis` | 1 | 29 | vitest, **root config only** — no per-package config, no `test` script, no `vitest` devDependency |
| `@openpanel/payments` | 1 | 35 | vitest, **root config only** — same |
| **total** | **7** | **178** | |

The task survey recorded db (5 files) and api (1) as "the only vitest suites
left". That is wrong in both directions: db has **4** test files, not 5, and
`packages/redis` + `packages/payments` are two more vitest suites, 64 tests
between them, which only ever run because the root workspace globs `packages/*`
and the root manifest carries the `vitest` devDependency. Neither is inside
M12-011's scope globs. See *The redis/payments constraint* below.

**`cd packages/core && bun test`** (bare, as the verification list spells it —
the package's own script is `bun test --isolate`):
**154 files, 1487 tests, 1475 pass / 12 skip / 0 fail — 45.82s.**

**`apps/start`**: `src/utils/math.test.ts`, **1 file, 2 tests, run by nothing.**
Measured, not assumed, in both directions:

- `pnpm --filter start test` → prints nothing, **exit 0** (pnpm treats a missing
  script in a filtered run as a no-op, so this reads green while testing zero).
- `cd apps/start && pnpm run test` → `[ERR_PNPM_NO_SCRIPT] Missing script: test`,
  exit 1.
- the root workspace file negates `apps/start`, so `pnpm test` never sees it.

### AFTER

Same box, same day, tree as this task leaves it. `pnpm test` is now a chain of
five `&&`-joined legs (root `package.json`); it exited **0**.

| Suite | Runner | Files | Tests | Result | Wall |
|---|---|---:|---:|---|---:|
| `@openpanel/core` | `bun test --isolate` | 154 | 1487 | 1475 pass / 12 skip / 0 fail | 88.12s |
| `@openpanel/db` | `bun test --isolate` | 4 | 101 | 101 pass / 0 fail | 10.47s |
| `@openpanel/api` | `bun test --isolate` | 1 | 13 | 13 pass / 0 fail | 4.40s |
| `apps/start` | `vitest run` (own config) | 1 | 2 | 2 pass | 1.22s |
| `redis` + `payments` | root `vitest run` | 2 | 64 | 64 pass | 0.44s |
| **`pnpm test` total** | | **162** | **1667** | **RC 0** | |

Per suite, before → after. Nothing shrank:

| Suite | Files before → after | Tests before → after |
|---|---|---|
| `@openpanel/db` | 4 → 4 | 101 → 101 |
| `@openpanel/api` | 1 → 1 | 13 → 13 |
| `@openpanel/redis` | 1 → 1 | 29 → 29 |
| `@openpanel/payments` | 1 → 1 | 35 → 35 |
| `@openpanel/core` | 154 → 154 | 1487 → 1487 (now **inside** `pnpm test`; before, only reachable by `cd`) |
| `apps/start` | 0 running → 1 | 0 running → 2 |
| **`pnpm test`** | **7 → 162** | **178 → 1667** |

The two `+` deltas are the point of the task: `packages/core`'s 1487 tests and
`apps/start`'s 2 were both invisible to `pnpm test` (and therefore to
`full.sh`) and now are not. No test was weakened, skipped or deleted — the
per-suite rows are equal everywhere else.

Standalone, as the verification list spells them:

| Command | Result | Wall |
|---|---|---:|
| `pnpm install --frozen-lockfile` | up to date, RC 0 | 0.4s |
| `cd packages/db && bun test` (bare) | 4 files, 101 pass / 0 fail / 0 skip | 2.74s |
| `cd apps/api && bun test` (bare) | 1 file, 13 pass / 0 fail | 3.77s |
| `cd apps/start && pnpm run test` | 1 file, 2 pass | 1.22s |
| `cd packages/core && bun test` (bare) | 154 files, 1475 pass / 12 skip / 0 fail | 47.34s |
| `pnpm run typecheck` | 17 passes, 0 fails, RC 0 | |
| `verification/full.sh` | **FULL: green**, RC 0, zero `FAIL:`, zero `BLOCKED`, goldens `137/137` | |

### What the preload had to do that `globalSetup` did not

`bunfig.toml`'s `[test] preload` has no once-per-run mode. Measured on Bun
1.4.0 in `packages/db` (4 test files): bare `bun test` → **1** preload;
`bun test --isolate` → **4** preloads, all in **one pid**, strictly sequential;
`bun test --parallel=4` → 4 preloads across 3 pids. Under `--isolate` neither
`globalThis` nor `process.env` survives from one preload to the next, so there
is no in-process channel to dedupe through — the only workable shape is the one
the ADR-010 note asked for: idempotent, and serialised by that sequencing.
`test/bun-preload.ts` is therefore run per file, and each run costs (measured
once, warm): import 333ms, `bootstrapTestDatabases` 1190ms, fixture load
1102ms, teardown 1045ms. That is where `packages/db`'s 2.7s bare run becomes
10.5s under `--isolate`.

Two things the move surfaced, neither of them a weakened test:

- **`pinTestDatabases()` is called twice**, at preload and again inside the
  `afterAll` teardown — exactly as `test/global-setup.ts` called it in both
  `setup` and `teardown`. vitest ran teardown in the parent process, which no
  test could reach; bun runs it in the test file's own realm, *after*
  `sql.round-robin.clickhouse.test.ts` has deliberately repointed
  `CLICKHOUSE_URL` at a dead node. Without the re-pin the teardown's
  `DELETE FROM ...` goes to `127.0.0.1:1` and the hook fails.
- **`sql.round-robin.clickhouse.test.ts` now restores `CLICKHOUSE_URL`** after
  the client module has read it. Under a bare `bun test` all four files share
  one global, and the dead-node-first URL leaked into
  `sql.clickhouse.test.ts`'s reachability probe: **22 of its tests silently
  skipped** (`79 pass / 22 skip`) before the restore, 101/101 after. This is one
  of the three coupling hazards ADR-010 named when it chose `--isolate`; the
  restore makes both modes agree.

### bun:test types the assertion, vitest did not

Two edits were type-level only; no assertion changed.

- `bun-types` (`1.4.0`, pinned as core pins it) joins `packages/db` and
  `apps/api` devDependencies, and each `tsconfig.json` names it in `types`
  (`bun:test` is declared nowhere else). ADR-017 row 7 authorises this addition.
- bun's `expect` has an `(actual?: never) => Matchers<undefined>` overload,
  which makes the argument position a **contextual inference site**.
  `sql.clickhouse.test.ts`'s local `value<T>()` helper, called bare, therefore
  resolved `T` to `never` and every `toBe` below it failed to compile; it now
  returns `unknown`. And `expect(config.ROLE).toBe(role)` in `env.test.ts`
  needs `as const` on the literal array, because bun's `toBe(expected: T)` is
  typed where vitest's was `any`.

### The redis/payments constraint — read this before deleting more vitest

The task's removal criterion is conditional: the root vitest artefacts go
"when nothing there uses them any more". Two suites still do.
`packages/redis/cachable.test.ts` and
`packages/payments/src/subscription-state.test.ts` have **no `test` script and
no `vitest` devDependency of their own** — they ran only because the root
workspace globbed `packages/*` and the root manifest carried `vitest`. Neither
package is inside M12-011's scope globs, so converting them was not this task's
to do. Deleting the root `vitest` devDependency and `vitest.workspace.ts`
anyway would have dropped 64 passing tests out of `pnpm test`, which the
before/after table above exists to prevent.

So: `vitest.config.ts`, `vitest.shared.ts`, `test/global-setup.ts`,
`test/test-setup.ts`, `packages/core/vitest.config.ts`,
`packages/db/vitest.config.ts` and `apps/api/vitest.config.ts` are **deleted**,
and `apps/api`'s `vitest ^1.0.0` devDependency with them.
`vitest.workspace.ts` survives, rewritten from a glob to the explicit list
`['packages/redis', 'packages/payments']`, and the root `vitest` devDependency
survives to run it. **Next step, when someone owns those two packages:** port
both to `bun:test`, delete `vitest.workspace.ts` and the root `vitest`
devDependency, and drop the last `&& vitest run` from the root `test` script.

Also left alone, out of scope: `CLAUDE.md:31` and `.claude/CLAUDE.md:25` still
describe `pnpm test` as "vitest run — packages/* and apps/* (excluding
apps/start, packages/core)", which this task made false.

## M13-002 — pnpm → `bun install --linker=isolated` (2026-09-07)

The installer swap (ADR-014, P13). `pnpm-workspace.yaml`, `pnpm-lock.yaml` and
`patches/` are gone; `bun.lock` is committed; every `package.json` script is off
pnpm. The stop rule did not fire. Full reasoning, the overrides table and the
measured bun-override semantics are in `docs/BUN_INSTALL_RECIPE.md`
(*M13-002 — the swap, as executed*).

### Install wall time and `node_modules` size

Both installers measured on this box on **2026-09-07** by the M13-002 implement
task, on the **same tree** (the manifests were already pinned by M13-001), and
in the same way: all 20 workspace `node_modules` directories removed first, the
installer's own global cache left warm, timed with `/usr/bin/time -f %e`. The
pnpm side was measured by stashing the swap so the tree was exactly `HEAD`
(`pnpm-workspace.yaml` + `pnpm-lock.yaml` + `patches/` present, root
`packageManager: pnpm@11.23.0`), then restored. pnpm self-selected **11.23.0**
from that field; the binary otherwise on PATH here is 11.24.0. Size is
`du -csh` over those same 20 directories.

| | pnpm 11.23.0 | Bun 1.4.0 |
|---|---:|---:|
| install, cold `node_modules` + warm global cache | `pnpm install --frozen-lockfile` — **8.60s**, **8.09s** (two runs) | `bun install --frozen-lockfile` — **2.89s**, **2.66s** (two runs) |
| install, warm (no-op re-run) | **0.43s** | **0.14s** |
| `node_modules`, all 20 directories | **3.0G** | **3.9G** |
| files under `node_modules` | 212 145 | 197 975 |
| packages | `resolved 3313, reused 3184, downloaded 0, added 3313` | `3002 packages installed` (3053 installs / 3429 packages per `--frozen-lockfile`) |
| global cache backing it | `~/.local/share/pnpm/store` — 9.4G | `~/.bun/install/cache` — 5.7G |

Bun installs this tree **~3× faster** cold (2.66-2.89s vs 8.09-8.60s) and leaves
a **~30% larger** `node_modules` from **7% fewer files**.

The size figure is the honest one to quote but it is not a
like-for-like disk claim: both installers hardlink from their own global cache,
`du` charges each inode to whichever tree it walks first, and the two caches are
different sizes. Nothing here has been measured *inside an image* — that is
M13-003's number, and it is the one that matters for deployment.

### `p13-drift.sh --report`, final

```
workspace package         dependency                        snapshot        installed
--------------------------------------------------------------------------------------------
--------------------------------------------------------------------------------------------
TOTAL: 0 drifted of 416 direct dependencies across 20 workspace packages
```

Zero, against `tooling/gates/p13-lock-snapshot.json` — the record of what pnpm
had resolved, and the only such record left now that `pnpm-lock.yaml` is
deleted. A bare `bun install` on the pinned tree started at **11 drifted**: nine
`peerDependencies` pnpm auto-installed and bun resolved differently, plus the
two ADR-017 rule 2 `prisma: ^5.1.1` carve-outs. Six peers and both prisma rows
were closed with `overrides`; the last three (`packages/sdks/nextjs`'s `next`,
`react`, `react-dom`) with exact devDependency pins, because bun's override key
space cannot scope a version to one importer — see the recipe.

### Known debt this swap leaves behind

- **pnpm cannot run a script inside this tree any more, and one controller gate
  had to learn that.** Two earlier M13-002 attempts blocked on
  `verification/contracts/sdk/dist-gate.sh`, which shelled out to a hardcoded
  `pnpm run build`: with `pnpm-workspace.yaml` gone, pnpm 11 fires an implicit
  install inside each SDK directory (the `verifyDepsBeforeRun: false` that
  suppressed it died with that file) and dies on
  `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`, because `catalog:` now resolves
  from the root `package.json`, where pnpm does not look. The operator fixed the
  gate to detect `bun.lock` exactly as `full.sh:12-19` does, and it is green
  (`DIST GATE: all 5 checked package(s) clean`, `FULL: green`). Recorded because
  the property generalises and will bite again: **any** script that invokes
  `pnpm` against this repo now fails at the deps check, not at the work. Every
  in-repo caller is off pnpm; the Dockerfiles are M13-003's and CI is M13-004's.
- **`check:deps` deviates from the `pnpm dlx` -> `bunx` translation, on
  purpose.** `bunx` (and `npx`) cannot give dependency-cruiser the TypeScript
  compiler it needs to tag an edge `type-only`, which is the exemption
  `core-uses-ctx-not-db-internals` is built on; under `bunx` the gate returns
  82 false errors on `import type` lines. It is not an installer problem —
  `bunx` returns the same 82 on a pnpm-installed tree. The script is now
  `bun tooling/scripts/check-deps.ts`, which installs the cruiser and
  `typescript@5.9.3` hoisted into `node_modules/.cache/depcruise`; it reproduces
  pnpm's numbers exactly (2703 modules, 18121 dependencies, zero violations).
  The debt is the shape, not the result: a repo-local dev tool is being fetched
  at gate time because ADR-017 forbids declaring it. Declaring
  `dependency-cruiser` as a root devDependency would delete this script; that is
  a register question, not a P13 one.
- **`packageManager` is gone and nothing replaced it as an asserted pin.** It
  was deleted rather than repointed to `bun@1.4.0` (reasoning in the recipe).
  ADR-016 rule 5 wants the Bun pin asserted in three places: `.bun-version`,
  `scripts/doctor.sh`, and a boot log line. Only `apps/api/Dockerfile:4`'s
  `ARG BUN_VERSION=1.4.0` exists today — there is no `.bun-version` file in the
  tree and `scripts/doctor.sh` has no bun check. Creating them is outside
  M13-002's scope (it touches neither a manifest nor the lockfile); it belongs
  with M13-003's Dockerfile work or a CLEAN task.
- **The root `package-lock.json` is still tracked.** ADR-014 says it should be
  deleted in the same commit as the lockfile swap ("tracked, stale, and a trap
  for any scanner or contributor running `npm ci`"). It is outside M13-002's
  scope globs, so it survives; it is one `git rm` for whoever owns the next P13
  task.
- **`overrides` row 1, `rolldown: 1.0.0-beta.43`, is now inert** — nothing in
  `bun.lock` requests rolldown since M12 deleted tsdown. Kept because ADR-017
  freezes the register; worth deleting the day that register is reopened.
- **`packages/core` and `packages/db` still declare a `jiti` devDependency** that
  no script invokes any more (ADR-019 row 7b is otherwise complete: every
  `jiti X.ts` is now `bun X.ts`). Deleting the two declarations is ADR-017
  rule 2's separate CLEAN task; doing it here would make `p13-drift.sh` report
  them `missing`.
- **`bun pm ls --trusted` is not empty** (it prints `simple-git-hooks@2.12.1`,
  which is on bun's 367-entry default-trusted list). ADR-014 benchmark item 6
  asked for that command to be empty. It cannot be: the list is not the
  enforcement point. `[install] ignoreScripts = true` in `bunfig.toml` is, and
  the property the item was really after — no dependency build script runs, as
  under pnpm's twelve `allowBuilds: false` — does hold.

## M13-003 image sizes

Carl asked for the two P13 images to be compared against the published ones.
All four numbers below are `docker image inspect --format '{{.Size}}'`, run on
this box on **2026-09-07**, Docker 29.7.2 with the **containerd snapshotter**.

**Read the caveat before the numbers.** Under the containerd snapshotter
`.Size` is the sum of the image's **compressed** layer blobs — what a registry
stores and what a `docker pull` transfers. `docker images`' `DISK USAGE` column
is the **uncompressed**, unpacked size on disk. They differ by ~5x here and
mixing them produces a meaningless comparison, so both are given, each labelled,
and the comparison column uses only the compressed pair.

| Image | Source | COMPRESSED (`inspect .Size`) | uncompressed (`docker images` DISK USAGE) |
|---|---|---:|---:|
| `openpanel-api:p13-gate` | built here from `apps/api/Dockerfile` | **412,899,646 B** (412.9 MB / 393.8 MiB) | 2.11 GB |
| `lindesvard/openpanel-api:latest` | pulled from Docker Hub | **476,399,142 B** (476.4 MB / 454.3 MiB) | 2.39 GB |
| `openpanel-dashboard:p13-gate` | built here from `apps/start/Dockerfile` | **95,217,524 B** (95.2 MB / 90.8 MiB) | 419 MB |
| `lindesvard/openpanel-dashboard:latest` | pulled from Docker Hub | **524,333,374 B** (524.3 MB / 500.0 MiB) | 2.77 GB |

Compressed deltas: api **−63.5 MB (−13.3%)**, dashboard **−429.1 MB (−81.8%)**.

### Provenance

The two `p13-gate` tags are exactly what `bash tooling/gates/p13-images.sh`
builds; the sizes above are the two lines that run prints — from the last of
four full builds on 2026-09-07. Rebuilding the same tree moves these numbers by
a few hundred to a few thousand bytes, because build timestamps sit inside the
layer metadata: the four runs gave the api 412,899,207 / 412,902,099 /
412,906,098 / 412,899,646 (spread 6.9 KB) and the dashboard 95,217,685 /
95,217,881 / 95,217,702 / 95,217,524 (spread 357 B). Anything larger than
~10 KB of drift is a real content change, not this noise. The published images
were pulled at their `latest` tags on 2026-09-07 and measured with the same
command:

| Image | digest | image `Created` |
|---|---|---|
| `lindesvard/openpanel-api:latest` | `sha256:cee4855cd715a7248c5c49090fe93a28ffc505541de20cb238d8884a6bcb9223` | 2026-08-18T21:22:28Z |
| `lindesvard/openpanel-dashboard:latest` | `sha256:b773cf864454a0ec89b2a133b48bf06202880ed650a75cc2f1f5c87aaed1cffa` | 2026-08-18T20:50:28Z |

Both were `docker rmi`'d after measuring — this box had ~4.5 GB free at that
point and two more from-scratch builds had to fit. Re-pull by digest to
reproduce.

**What the two deltas are not.** They are not a like-for-like measurement of
"the installer changed". The published images are ~3 weeks older than this
branch's HEAD and were built from a tree with a different dependency set, so the
api's −63.5 MB mixes the installer swap with three weeks of unrelated content.
The dashboard's −429.1 MB is dominated by one deliberate change in this task
and not by the installer at all: the previous runner stage copied a workspace
`node_modules`, `packages/db`, `packages/payments`, `packages/sdks/_info` and
the deleted `@openpanel/auth` tree alongside `.output`, and this one copies only
`.output`, which is verified standalone (222 bundled packages of its own; it
serves `/login` from an otherwise empty directory).

### Known break in the shipped compose templates — pre-existing, not P13's

`self-hosting/docker-compose.template.yml`, `self-hosting/coolify.yml` and
`.github/smoke/docker-compose.yml` all start the api container with

```
cd /app/packages/db && ./node_modules/.bin/prisma migrate deploy
```

**That binary is not in the image**, and was not before this task either.
`prisma` is a `devDependency` of `packages/db`, and both the old and the new
image install production dependencies only, so it is correctly omitted. Measured
2026-09-07 against a freshly built `openpanel-api:p13-gate`:

```
$ docker run --rm --entrypoint sh openpanel-api:p13-gate \
    -c 'cd /app/packages/db && ./node_modules/.bin/prisma migrate deploy'
sh: 1: ./node_modules/.bin/prisma: not found
```

(`./node_modules/.bin/jiti`, the second migration command, **is** present —
`jiti` is a real dependency of `packages/core`.)

`docs/OPS_DEPLOY_MIGRATION.md`'s M9-006 section records these commands as
"verified", but the verification it describes was run against this box's local
Postgres/ClickHouse — on the **host**, not inside the container — so the
image's contents were never the thing under test.

Left unfixed on purpose: the two candidate fixes are "ship the Prisma CLI in the
production image" and "run migrations from somewhere that has it", and choosing
between them is a decision about what the image contains, not an installer
change. M13-003's scope is the swap. The note is repeated in both compose
templates so a self-hoster reading the file sees it.

### Also recorded

- **`.bun-version` still does not exist.** ADR-016 names it as Bun's declared
  home alongside `ARG BUN_VERSION`; both Dockerfiles carry the ARG and nothing
  carries the file. Unchanged from M13-002's note.
- **Both images now `COPY . .` and install the whole workspace**, which is the
  shape ADR-014 Problems §4 rules for a bun-base image. The cost is that a
  source edit invalidates the install layer, so neither image has a
  manifests-only cache tier any more. The benefit is that the hand-maintained
  per-package `COPY packages/x/package.json` list — whose own comment recorded
  that drifting silently omitted a package from `node_modules` — is gone from
  both files.
- **The api image's production install is `--filter '@openpanel/api'`**, not a
  bare `--production`. A bare install at the workspace root pulls every member's
  production closure, including `apps/start`'s (§5d). Verified on Bun 1.4.0 that
  `--filter` follows `workspace:` edges transitively and installs nothing
  outside the filtered closure.

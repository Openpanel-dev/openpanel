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

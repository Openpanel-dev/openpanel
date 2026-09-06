# tRPC procedure-set equivalence: `@openpanel/core` vs `@openpanel/trpc`

Evidence for M11-001, produced 2026-09-06 on branch `rewrite/v2` at `04b211e3`.

> **Status: the swap is done.** Sections 1-3 below are attempts 1 and 2's
> findings, kept verbatim because they are what the fix was measured against.
> The work and its re-run are in *M11-001 attempt 3* at the end of this file;
> read that for the current state.

At the time attempts 1 and 2 were written, `apps/api/src/main.ts:95` still
mounted `@openpanel/trpc`'s `appRouter`. Core's
`rpc.router.ts` has been typechecked since P2-009 but has never served a
request. This file records the comparison that must pass before the mount is
swapped.

## Method

A throwaway script (`packages/core/procedure-diff.tmp.ts`, since deleted)
imported both routers and printed `Object.keys(router._def.procedures).sort()`
— tRPC 11.17.0 keys that record by dotted procedure path, so it is the full
flat procedure set of each router.

```bash
cd packages/core && bun run procedure-diff.tmp.ts
```

The process computes both lists in under a second and then does not exit: the
`@openpanel/trpc` import graph opens two Redis connections at import time
(`ss -tnp` showed two ESTAB sockets to `:6379` held by the bun pid). The lists
were written to disk with `Bun.write` before that point and diffed separately.

## Result — the diff is NOT empty

```
core(@openpanel/core): 217 procedures across 29 routers
trpc(@openpanel/trpc): 216 procedures across 28 routers

$ diff procedure-paths-trpc.txt procedure-paths-core.txt
97a98
> health.live
```

One line. Core is a **strict superset**: every one of the 216 procedures
`@openpanel/trpc` serves today exists in core under the identical path, and
core adds exactly one, `health.live`.

`health.live` is not drift. It was added by P2-009 (`61ccc7cb`) as core's own
scaffold proof and its source comment says so explicitly:

> The one procedure `rpc.router.ts` mounts before the first real module lands
> (ADR-007 decision 19) — proves the tRPC surface composes end to end. No V1
> router named `health` exists.

`apps/start` never references `health.*`, so mounting it adds a procedure no
client calls rather than changing one any client does.

M11-001 attempt 2's acceptance criterion expects **exactly this diff** and
forbids deleting `health.live` to force it empty. Reproduced on 2026-09-06 at
`04b211e3`, byte-identical to attempt 1's result. The procedure sets are
equivalent; the mount swap is blocked by the routing golden below, not by this.

## Per-router coverage by existing automated checks

The three checks named in the task cover the tRPC surface as follows.

- **session-e2e** (`apps/api/e2e/session-e2e.ts`) issues **zero** tRPC
  requests. It drives `POST /track` and asserts ClickHouse and Redis state. Its
  29/29 pass says nothing about any procedure.
- **golden REST suite** (`verification/golden/`, 137 cases: 112 `insights`,
  25 `export`) is REST-only. It will **not** catch a tRPC regression.
- **auth contract suite** (`verification/contracts/auth/`) is the only check
  that issues tRPC requests: 11 procedures across 7 routers. It asserts
  authorization outcomes (401/403/200), not response shape.

| # | Router | Procs | Covered by | Procedures exercised |
|---|---|---:|---|---|
| 1 | auth | 15 | **nothing** | — |
| 2 | chart | 12 | auth contract suite (1/12) | `chart.aggregate` |
| 3 | chat | 1 | **nothing** | — |
| 4 | client | 4 | **nothing** | — |
| 5 | cohort | 13 | auth contract suite (1/13) | `cohort.refresh` |
| 6 | conversation | 4 | auth contract suite (2/4) | `conversation.get`, `conversation.rename` |
| 7 | dashboard | 5 | auth contract suite (3/5) | `dashboard.create`, `dashboard.list`, `dashboard.delete` |
| 8 | email | 3 | **nothing** | — |
| 9 | event | 12 | **nothing** | — |
| 10 | group | 14 | **nothing** | — |
| 11 | gsc | 14 | **nothing** | — |
| 12 | health | 1 | **nothing** | — (core-only; see diff above) |
| 13 | import | 5 | auth contract suite (1/5) | `import.delete` |
| 14 | insight | 3 | **nothing** | — |
| 15 | integration | 8 | **nothing** | — |
| 16 | notification | 4 | **nothing** | — |
| 17 | onboarding | 2 | **nothing** | — |
| 18 | organization | 13 | auth contract suite (1/13) | `organization.list` |
| 19 | overview | 13 | **nothing** | — |
| 20 | profile | 9 | **nothing** | — |
| 21 | project | 7 | **nothing** | — |
| 22 | realtime | 6 | **nothing** | — |
| 23 | reference | 5 | **nothing** | — |
| 24 | report | 10 | auth contract suite (2/10) | `report.get`, `report.update` |
| 25 | session | 4 | **nothing** | — |
| 26 | share | 10 | **nothing** | — |
| 27 | subscription | 9 | **nothing** | — |
| 28 | user | 5 | **nothing** | — |
| 29 | widget | 6 | **nothing** | — |

**11 of 217 procedures (5%) are exercised over HTTP by any of the three
checks. 22 of 29 routers have no end-to-end coverage at all.**

Not counted above, because the task named three specific checks and these are
not them: 21 `packages/core/src/modules/*/*.rpc.test.ts` files run under
`bun test`. They are in-process unit tests over mocked deps — they prove a
procedure's logic, not that it is reachable through the mounted router, the
Elysia lifecycle, the session macro or superjson.

## Consequence

The mount swap is a change whose blast radius is 217 procedures against 11
procedures of end-to-end coverage. That gap is a real finding independent of
the `health.live` diff, and it is why the task asked for this table.

---

# The tRPC routing golden (M11-001 attempt 2, 2026-09-06)

`apps/api/e2e/trpc-routing-golden.ts` is the gate the mount swap must pass, and
it exists because of the 11/217 coverage gap measured above. It enumerates the
mounted router's procedures, issues one **unauthenticated** request per path
through `/trpc/<path>` (GET `?input=` for queries, POST for mutations,
superjson `{}`), and records `{type, status, tRPC error code}` per path. A 404
or `NOT_FOUND` is a routing failure and exits non-zero; 400/401/403 are passes —
they prove the procedure resolved and its validation/auth ran.

The router specifier is read out of `apps/api/src/main.ts`'s `appRouter` import,
so the same committed script measures both sides of the swap with no flag.

## Both runs, harness up (`verification/harness start`), local box, 2026-09-06

```
$ cd apps/api && bun run e2e/trpc-routing-golden.ts /tmp/trpc-routing-before.json
mounted router: @openpanel/trpc
probing 216 procedures across 28 routers at http://127.0.0.1:3333
     4  200 ok
    17  400 BAD_REQUEST
   195  401 UNAUTHORIZED
trpc-routing-golden: 216/216 reachable, 0 routing failure(s)     exit 0

$ cd apps/api && bun run e2e/trpc-routing-golden.ts /tmp/trpc-routing-after.json
mounted router: @openpanel/core
probing 217 procedures across 29 routers at http://127.0.0.1:3333
     5  200 ok
   193  400 BAD_REQUEST
    19  401 UNAUTHORIZED
trpc-routing-golden: 217/217 reachable, 0 routing failure(s)     exit 0
```

**Reachability passes on both sides**: every one of core's 217 procedures
resolves through the real Elysia lifecycle and the tRPC fetch mount. Nothing is
unroutable, and `health.live` is the only path present on one side only.

## The maps are NOT identical — 176 of 216 shared paths answer differently

```
only in AFTER:  ['health.live']
only in BEFORE: []
changed:        176      # all of them 401 UNAUTHORIZED -> 400 BAD_REQUEST
  auth.totpDisable:  401 UNAUTHORIZED  ->  400 BAD_REQUEST
  chart.aggregate:   401 UNAUTHORIZED  ->  400 BAD_REQUEST
  client.list:       401 UNAUTHORIZED  ->  400 BAD_REQUEST
  ...
```

Cause: V1's routers are built on `packages/trpc/src/trpc.ts:142`'s
`protectedProcedure = procedure.use(enforceUserIsAuthed).use(enforceAccess)…`,
so authentication runs **before** input parsing and an anonymous caller gets
`UNAUTHORIZED` whatever it sends. Core's ported routers use the bare
`procedure` and do their auth **inside the handler** — `rpc/base.ts:90` says the
middleware stack "lands with auth (P6)", and it never did. Input parsing
therefore precedes authentication, and an anonymous caller with a malformed
input gets `BAD_REQUEST`.

## The consequence the golden's empty input hides — 3 procedures lose authorization

Ordering alone would be a contract detail. But because the check moved from a
middleware to per-handler code, a procedure can simply not have one. Probing
**queries only** (no mutations, no side effects) with a plausible input,
unauthenticated, on the same box and the same harness, 2026-09-06:

```
$ bun run authprobe.tmp.ts   # throwaway, deleted; input {projectId, organizationId}
mounted: @openpanel/trpc     queries: 133      mounted: @openpanel/core   queries: 134
    2  200 ok                                      6  200 ok
    9  400 BAD_REQUEST                            70  400 BAD_REQUEST
  122  401 UNAUTHORIZED                           57  401 UNAUTHORIZED
                                                   1  500 INTERNAL_SERVER_ERROR

401/other -> 200 (authorization LOST): client.list, subscription.getCurrent, subscription.usage
401 UNAUTHORIZED -> 400 BAD_REQUEST:   61
identical:                             68 / 133 shared query paths
core-only 500:                         subscription.products (trpc: 401 UNAUTHORIZED)
```

What the three return to a caller with no cookie and no credential:

| Procedure | trpc | core | Body |
|---|---|---|---|
| `client.list` | 401 | **200** | `array of {createdAt,id,ignoreCorsAndSecret,name,organizationId,projectId,secret,type,updatedAt}` — the project's ingestion clients, `secret` included (ADR-011 already flags that field as the scrypt hash) |
| `subscription.usage` | 401 | **200** | `array[31] of {count, day}` — 31 days of per-day event volume for any projectId |
| `subscription.getCurrent` | 401 | **200** | `null` for an org with no subscription; not gated either way |

`client.list`'s source comment is the whole story
(`modules/client/client.rpc.ts:31`):

> Ported verbatim: V1's `client.list` reads by projectId with no access check of
> its own (packages/trpc/src/routers/client.ts).

True of the *handler body*, and wrong about the procedure: V1's `client.list` is
a `protectedProcedure`, so `enforceUserIsAuthed` + `enforceAccess` gated it on
the `projectId` in the input. Dropping the stack dropped the check.

`auth.session`, `onboarding.skipOnboardingCheck` and `health.live` also answer
200 on core; the first two answer 200 on trpc too and are legitimately public.

## Verdict (attempt 2 — SUPERSEDED by attempt 3 below, which did the work)

The swap is **not** blocked by reachability, by the procedure set, or by
anything `health.live` does. It is blocked because mounting core today would
publish three authenticated read endpoints to anonymous callers and change the
error precedence of 176 more. The fix is the P6 work `rpc/base.ts:90` defers:
port `publicProcedure` / `protectedProcedure` / `protectedProcedureWithoutAccess`
(and with them `enforceUserIsAuthed`, `enforceAccess`, `loggerMiddleware`,
`sessionScopeMiddleware`) into core and rebuild the 29 routers on them. That
restores auth-before-validation by construction and makes the missing check
impossible rather than per-handler. It is a wave, not a line, and it is not
M11-001's to do.

Re-run this golden after that work: the diff should then be `health.live` only.

---

# M11-001 attempt 3: the port landed, and the swap is live

Produced 2026-09-06 on branch `rewrite/v2` on top of `04b211e3`. Attempt 2's
two artefacts above (`apps/api/e2e/trpc-routing-golden.ts` and everything up to
its verdict) are unchanged; this section records the work that verdict named as
the fix, and the re-run of its own gate.

## What landed

`packages/trpc/src/trpc.ts:35-155`'s four middlewares are now in
`packages/core/src/rpc/base.ts`, with their logic unchanged:

| Middleware | Change on the port |
|---|---|
| `enforceUserIsAuthed` | none, except `console.error` → `ctx.logger.error` (core has a request-scoped logger; CLAUDE.md bans `console`). Same branch, same messages. |
| `enforceAccess` | the two lookups come through `ctx.services.auth.requireProjectAccess` / `.getOrganizationAccess` instead of `packages/trpc/src/access.ts`'s direct imports. M10-002 bound the ladder there once. Everything else — `runWithAlsSession` first, `getRawInput()` before the demo-mode ban, top-level `has('projectId')` / `has('organizationId')` only, `needsWrite = type === 'mutation' && !meta?.readOnlyMutation` — is character-for-character V1's. |
| `loggerMiddleware` | none. |
| `sessionScopeMiddleware` | none. |

and the three builders compose them in V1's order (`trpc.ts:141-155`):

```ts
publicProcedure                 = procedure.use(logger).use(sessionScope);
protectedProcedure              = procedure.use(enforceUserIsAuthed)
                                           .use(enforceAccess)
                                           .use(logger).use(sessionScope);
protectedProcedureWithoutAccess = procedure.use(enforceUserIsAuthed)
                                           .use(logger).use(sessionScope);
```

`rpc/base.ts:90`'s "they land with auth (P6)" comment is gone; what replaces it
says why the stack is a stack — authentication before input parsing, a check
that cannot be forgotten, and the raw-input rule ADR-011 invariant 2 states.

`apps/api/src/main.ts` imports `appRouter` from `@openpanel/core` (biome folded
it into the existing core block at line 36). `packages/trpc` is untouched and
still typechecks and tests green — it builds on the same `procedure`.

## The rebuild: every procedure on its V1 twin's builder

Derived per procedure, not per file: both routers were parsed for the
top-level `name: builder` entries of their `createTRPCRouter({...})` object
(comments and string literals blanked first, so a `//` line cannot be mistaken
for an entry). 216 V1 procedures, 217 core procedures, and every shared name
now carries the same builder.

`chartProcedure` and `overviewProcedure` are V1's own share-aware builders —
both are `publicProcedure` plus one middleware — and core now has them in the
same shape rather than as per-handler calls. That is load-bearing for the
golden: their access decision has to run before the input parser, or a
`chartProcedure` path answers `BAD_REQUEST` where V1 answers `UNAUTHORIZED`.
`chart.rpc.ts`'s `resolveShareableReport` helper is gone; the resolved report
rides on `ctx.report`, exactly as in V1.

| Router | Procs | public | protected | withoutAccess | share-aware |
|---|---:|---:|---:|---:|---:|
| auth | 15 | 10 | 5 | 0 | 0 |
| chart | 12 | 0 | 7 | 0 | 5 |
| chat | 1 | 0 | 1 | 0 | 0 |
| client | 4 | 0 | 4 | 0 | 0 |
| cohort | 13 | 0 | 13 | 0 | 0 |
| conversation | 4 | 0 | 4 | 0 | 0 |
| dashboard | 5 | 0 | 5 | 0 | 0 |
| email | 3 | 1 | 2 | 0 | 0 |
| event | 12 | 0 | 12 | 0 | 0 |
| group | 14 | 0 | 14 | 0 | 0 |
| gsc | 14 | 0 | 14 | 0 | 0 |
| health | 1 | 1 | 0 | 0 | 0 |
| import | 5 | 0 | 5 | 0 | 0 |
| insight | 3 | 0 | 3 | 0 | 0 |
| integration | 8 | 0 | 8 | 0 | 0 |
| notification | 4 | 0 | 4 | 0 | 0 |
| onboarding | 2 | 1 | 1 | 0 | 0 |
| organization | 13 | 1 | 11 | 1 | 0 |
| overview | 13 | 0 | 1 | 0 | 12 |
| profile | 9 | 0 | 9 | 0 | 0 |
| project | 7 | 0 | 7 | 0 | 0 |
| realtime | 6 | 0 | 6 | 0 | 0 |
| reference | 5 | 1 | 4 | 0 | 0 |
| report | 10 | 0 | 10 | 0 | 0 |
| session | 4 | 0 | 4 | 0 | 0 |
| share | 10 | 4 | 6 | 0 | 0 |
| subscription | 9 | 0 | 9 | 0 | 0 |
| user | 5 | 0 | 5 | 0 | 0 |
| widget | 6 | 3 | 3 | 0 | 0 |
| **total** | **217** | **22** | **177** | **1** | **17** |

`health.live` is core-only (P2-009) and is `publicProcedure`.

**No in-handler check was removed.** ADR-011 counts 58 of them and the auth
contract suite's group C tests 14; every one still runs, now behind the
builder's check rather than instead of it.

<details>
<summary>All 217 procedures: path → V1 builder → core builder</summary>

| Procedure | V1 builder | core builder |
|---|---|---|
| `chat.models` | `protectedProcedure` | `protectedProcedure` |
| `auth.signOut` | `publicProcedure` | `publicProcedure` |
| `auth.signInOAuth` | `publicProcedure` | `publicProcedure` |
| `auth.signUpEmail` | `publicProcedure` | `publicProcedure` |
| `auth.signInEmail` | `publicProcedure` | `publicProcedure` |
| `auth.signInTotp` | `publicProcedure` | `publicProcedure` |
| `auth.totpStatus` | `protectedProcedure` | `protectedProcedure` |
| `auth.totpSetup` | `protectedProcedure` | `protectedProcedure` |
| `auth.totpEnable` | `protectedProcedure` | `protectedProcedure` |
| `auth.totpDisable` | `protectedProcedure` | `protectedProcedure` |
| `auth.totpRegenerateRecoveryCodes` | `protectedProcedure` | `protectedProcedure` |
| `auth.resetPassword` | `publicProcedure` | `publicProcedure` |
| `auth.requestResetPassword` | `publicProcedure` | `publicProcedure` |
| `auth.session` | `publicProcedure` | `publicProcedure` |
| `auth.extendSession` | `publicProcedure` | `publicProcedure` |
| `auth.signInShare` | `publicProcedure` | `publicProcedure` |
| `chart.projectCard` | `protectedProcedure` | `protectedProcedure` |
| `chart.events` | `protectedProcedure` | `protectedProcedure` |
| `chart.properties` | `protectedProcedure` | `protectedProcedure` |
| `chart.values` | `protectedProcedure` | `protectedProcedure` |
| `chart.funnel` | `chartProcedure` | `chartProcedure` |
| `chart.conversion` | `chartProcedure` | `chartProcedure` |
| `chart.sankey` | `protectedProcedure` | `protectedProcedure` |
| `chart.chart` | `chartProcedure` | `chartProcedure` |
| `chart.aggregate` | `chartProcedure` | `chartProcedure` |
| `chart.cohort` | `chartProcedure` | `chartProcedure` |
| `chart.getProfiles` | `protectedProcedure` | `protectedProcedure` |
| `chart.getFunnelProfiles` | `protectedProcedure` | `protectedProcedure` |
| `client.list` | `protectedProcedure` | `protectedProcedure` |
| `client.update` | `protectedProcedure` | `protectedProcedure` |
| `client.create` | `protectedProcedure` | `protectedProcedure` |
| `client.remove` | `protectedProcedure` | `protectedProcedure` |
| `cohort.list` | `protectedProcedure` | `protectedProcedure` |
| `cohort.get` | `protectedProcedure` | `protectedProcedure` |
| `cohort.create` | `protectedProcedure` | `protectedProcedure` |
| `cohort.update` | `protectedProcedure` | `protectedProcedure` |
| `cohort.delete` | `protectedProcedure` | `protectedProcedure` |
| `cohort.listProfiles` | `protectedProcedure` | `protectedProcedure` |
| `cohort.mostEvents` | `protectedProcedure` | `protectedProcedure` |
| `cohort.eventsPerDay` | `protectedProcedure` | `protectedProcedure` |
| `cohort.popularRoutes` | `protectedProcedure` | `protectedProcedure` |
| `cohort.getCount` | `protectedProcedure` | `protectedProcedure` |
| `cohort.preview` | `protectedProcedure` | `protectedProcedure` |
| `cohort.exportProfiles` | `protectedProcedure` | `protectedProcedure` |
| `cohort.refresh` | `protectedProcedure` | `protectedProcedure` |
| `conversation.list` | `protectedProcedure` | `protectedProcedure` |
| `conversation.get` | `protectedProcedure` | `protectedProcedure` |
| `conversation.rename` | `protectedProcedure` | `protectedProcedure` |
| `conversation.delete` | `protectedProcedure` | `protectedProcedure` |
| `dashboard.list` | `protectedProcedure` | `protectedProcedure` |
| `dashboard.byId` | `protectedProcedure` | `protectedProcedure` |
| `dashboard.create` | `protectedProcedure` | `protectedProcedure` |
| `dashboard.update` | `protectedProcedure` | `protectedProcedure` |
| `dashboard.delete` | `protectedProcedure` | `protectedProcedure` |
| `email.unsubscribe` | `publicProcedure` | `publicProcedure` |
| `email.getPreferences` | `protectedProcedure` | `protectedProcedure` |
| `email.updatePreferences` | `protectedProcedure` | `protectedProcedure` |
| `event.updateEventMeta` | `protectedProcedure` | `protectedProcedure` |
| `event.byId` | `protectedProcedure` | `protectedProcedure` |
| `event.details` | `protectedProcedure` | `protectedProcedure` |
| `event.events` | `protectedProcedure` | `protectedProcedure` |
| `event.conversionNames` | `protectedProcedure` | `protectedProcedure` |
| `event.conversions` | `protectedProcedure` | `protectedProcedure` |
| `event.bots` | `protectedProcedure` | `protectedProcedure` |
| `event.pages` | `protectedProcedure` | `protectedProcedure` |
| `event.pagesTimeseries` | `protectedProcedure` | `protectedProcedure` |
| `event.previousPages` | `protectedProcedure` | `protectedProcedure` |
| `event.pageTimeseries` | `protectedProcedure` | `protectedProcedure` |
| `event.origin` | `protectedProcedure` | `protectedProcedure` |
| `group.list` | `protectedProcedure` | `protectedProcedure` |
| `group.byId` | `protectedProcedure` | `protectedProcedure` |
| `group.create` | `protectedProcedure` | `protectedProcedure` |
| `group.update` | `protectedProcedure` | `protectedProcedure` |
| `group.delete` | `protectedProcedure` | `protectedProcedure` |
| `group.types` | `protectedProcedure` | `protectedProcedure` |
| `group.metrics` | `protectedProcedure` | `protectedProcedure` |
| `group.activity` | `protectedProcedure` | `protectedProcedure` |
| `group.memberGrowth` | `protectedProcedure` | `protectedProcedure` |
| `group.listProfiles` | `protectedProcedure` | `protectedProcedure` |
| `group.mostEvents` | `protectedProcedure` | `protectedProcedure` |
| `group.popularRoutes` | `protectedProcedure` | `protectedProcedure` |
| `group.properties` | `protectedProcedure` | `protectedProcedure` |
| `group.listByIds` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getConnection` | `protectedProcedure` | `protectedProcedure` |
| `gsc.initiateOAuth` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getSites` | `protectedProcedure` | `protectedProcedure` |
| `gsc.selectSite` | `protectedProcedure` | `protectedProcedure` |
| `gsc.disconnect` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getOverview` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getPages` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getPageDetails` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getQueryDetails` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getQueries` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getSearchEngines` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getAiEngines` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getPreviousOverview` | `protectedProcedure` | `protectedProcedure` |
| `gsc.getCannibalization` | `protectedProcedure` | `protectedProcedure` |
| `health.live` | `— (core-only)` | `publicProcedure` |
| `import.list` | `protectedProcedure` | `protectedProcedure` |
| `import.get` | `protectedProcedure` | `protectedProcedure` |
| `import.create` | `protectedProcedure` | `protectedProcedure` |
| `import.delete` | `protectedProcedure` | `protectedProcedure` |
| `import.retry` | `protectedProcedure` | `protectedProcedure` |
| `insight.list` | `protectedProcedure` | `protectedProcedure` |
| `insight.listAll` | `protectedProcedure` | `protectedProcedure` |
| `insight.explain` | `protectedProcedure` | `protectedProcedure` |
| `integration.get` | `protectedProcedure` | `protectedProcedure` |
| `integration.list` | `protectedProcedure` | `protectedProcedure` |
| `integration.createOrUpdateSlack` | `protectedProcedure` | `protectedProcedure` |
| `integration.createOrUpdate` | `protectedProcedure` | `protectedProcedure` |
| `integration.createOrUpdateExport` | `protectedProcedure` | `protectedProcedure` |
| `integration.testConnection` | `protectedProcedure` | `protectedProcedure` |
| `integration.testExportConnection` | `protectedProcedure` | `protectedProcedure` |
| `integration.delete` | `protectedProcedure` | `protectedProcedure` |
| `notification.list` | `protectedProcedure` | `protectedProcedure` |
| `notification.rules` | `protectedProcedure` | `protectedProcedure` |
| `notification.createOrUpdateRule` | `protectedProcedure` | `protectedProcedure` |
| `notification.deleteRule` | `protectedProcedure` | `protectedProcedure` |
| `onboarding.skipOnboardingCheck` | `publicProcedure` | `publicProcedure` |
| `onboarding.project` | `protectedProcedure` | `protectedProcedure` |
| `organization.get` | `protectedProcedure` | `protectedProcedure` |
| `organization.list` | `protectedProcedure` | `protectedProcedure` |
| `organization.myAccess` | `protectedProcedureWithoutAccess` | `protectedProcedureWithoutAccess` |
| `organization.update` | `protectedProcedure` | `protectedProcedure` |
| `organization.delete` | `protectedProcedure` | `protectedProcedure` |
| `organization.cancelDeletion` | `protectedProcedure` | `protectedProcedure` |
| `organization.inviteUser` | `protectedProcedure` | `protectedProcedure` |
| `organization.revokeInvite` | `protectedProcedure` | `protectedProcedure` |
| `organization.removeMember` | `protectedProcedure` | `protectedProcedure` |
| `organization.updateMemberAccess` | `protectedProcedure` | `protectedProcedure` |
| `organization.members` | `protectedProcedure` | `protectedProcedure` |
| `organization.invitations` | `protectedProcedure` | `protectedProcedure` |
| `organization.getInvite` | `publicProcedure` | `publicProcedure` |
| `overview.liveVisitors` | `overviewProcedure` | `overviewProcedure` |
| `overview.liveData` | `overviewProcedure` | `overviewProcedure` |
| `overview.stats` | `overviewProcedure` | `overviewProcedure` |
| `overview.getReferrerSpikes` | `overviewProcedure` | `overviewProcedure` |
| `overview.topPages` | `overviewProcedure` | `overviewProcedure` |
| `overview.topGeneric` | `overviewProcedure` | `overviewProcedure` |
| `overview.topGenericSeries` | `overviewProcedure` | `overviewProcedure` |
| `overview.userJourney` | `overviewProcedure` | `overviewProcedure` |
| `overview.topEvents` | `overviewProcedure` | `overviewProcedure` |
| `overview.topConversions` | `overviewProcedure` | `overviewProcedure` |
| `overview.topLinkOut` | `overviewProcedure` | `overviewProcedure` |
| `overview.runFilterCommand` | `protectedProcedure` | `protectedProcedure` |
| `overview.map` | `overviewProcedure` | `overviewProcedure` |
| `profile.byId` | `protectedProcedure` | `protectedProcedure` |
| `profile.metrics` | `protectedProcedure` | `protectedProcedure` |
| `profile.activity` | `protectedProcedure` | `protectedProcedure` |
| `profile.mostEvents` | `protectedProcedure` | `protectedProcedure` |
| `profile.popularRoutes` | `protectedProcedure` | `protectedProcedure` |
| `profile.properties` | `protectedProcedure` | `protectedProcedure` |
| `profile.list` | `protectedProcedure` | `protectedProcedure` |
| `profile.powerUsers` | `protectedProcedure` | `protectedProcedure` |
| `profile.values` | `protectedProcedure` | `protectedProcedure` |
| `project.getProjectWithClients` | `protectedProcedure` | `protectedProcedure` |
| `project.activationStatus` | `protectedProcedure` | `protectedProcedure` |
| `project.list` | `protectedProcedure` | `protectedProcedure` |
| `project.update` | `protectedProcedure` | `protectedProcedure` |
| `project.create` | `protectedProcedure` | `protectedProcedure` |
| `project.delete` | `protectedProcedure` | `protectedProcedure` |
| `project.cancelDeletion` | `protectedProcedure` | `protectedProcedure` |
| `realtime.coordinates` | `protectedProcedure` | `protectedProcedure` |
| `realtime.mapBadgeDetails` | `protectedProcedure` | `protectedProcedure` |
| `realtime.activeSessions` | `protectedProcedure` | `protectedProcedure` |
| `realtime.paths` | `protectedProcedure` | `protectedProcedure` |
| `realtime.referrals` | `protectedProcedure` | `protectedProcedure` |
| `realtime.geo` | `protectedProcedure` | `protectedProcedure` |
| `reference.getReferences` | `protectedProcedure` | `protectedProcedure` |
| `reference.create` | `protectedProcedure` | `protectedProcedure` |
| `reference.update` | `protectedProcedure` | `protectedProcedure` |
| `reference.delete` | `protectedProcedure` | `protectedProcedure` |
| `reference.getChartReferences` | `publicProcedure` | `publicProcedure` |
| `report.list` | `protectedProcedure` | `protectedProcedure` |
| `report.create` | `protectedProcedure` | `protectedProcedure` |
| `report.update` | `protectedProcedure` | `protectedProcedure` |
| `report.move` | `protectedProcedure` | `protectedProcedure` |
| `report.delete` | `protectedProcedure` | `protectedProcedure` |
| `report.duplicate` | `protectedProcedure` | `protectedProcedure` |
| `report.get` | `protectedProcedure` | `protectedProcedure` |
| `report.updateLayout` | `protectedProcedure` | `protectedProcedure` |
| `report.getLayouts` | `protectedProcedure` | `protectedProcedure` |
| `report.resetLayout` | `protectedProcedure` | `protectedProcedure` |
| `session.list` | `protectedProcedure` | `protectedProcedure` |
| `session.distinctValues` | `protectedProcedure` | `protectedProcedure` |
| `session.byId` | `protectedProcedure` | `protectedProcedure` |
| `session.replayChunksFrom` | `protectedProcedure` | `protectedProcedure` |
| `share.overview` | `publicProcedure` | `publicProcedure` |
| `share.overviewSettings` | `protectedProcedure` | `protectedProcedure` |
| `share.createOverview` | `protectedProcedure` | `protectedProcedure` |
| `share.dashboard` | `publicProcedure` | `publicProcedure` |
| `share.dashboardSettings` | `protectedProcedure` | `protectedProcedure` |
| `share.createDashboard` | `protectedProcedure` | `protectedProcedure` |
| `share.dashboardReports` | `publicProcedure` | `publicProcedure` |
| `share.report` | `publicProcedure` | `publicProcedure` |
| `share.reportSettings` | `protectedProcedure` | `protectedProcedure` |
| `share.createReport` | `protectedProcedure` | `protectedProcedure` |
| `subscription.getCurrent` | `protectedProcedure` | `protectedProcedure` |
| `subscription.checkout` | `protectedProcedure` | `protectedProcedure` |
| `subscription.products` | `protectedProcedure` | `protectedProcedure` |
| `subscription.usage` | `protectedProcedure` | `protectedProcedure` |
| `subscription.cancelSubscription` | `protectedProcedure` | `protectedProcedure` |
| `subscription.pauseSubscription` | `protectedProcedure` | `protectedProcedure` |
| `subscription.resumeSubscription` | `protectedProcedure` | `protectedProcedure` |
| `subscription.applySaveDiscount` | `protectedProcedure` | `protectedProcedure` |
| `subscription.portal` | `protectedProcedure` | `protectedProcedure` |
| `user.deletionBlockers` | `protectedProcedure` | `protectedProcedure` |
| `user.delete` | `protectedProcedure` | `protectedProcedure` |
| `user.update` | `protectedProcedure` | `protectedProcedure` |
| `user.debugPostCookie` | `protectedProcedure` | `protectedProcedure` |
| `user.debugGetCookie` | `protectedProcedure` | `protectedProcedure` |
| `widget.get` | `protectedProcedure` | `protectedProcedure` |
| `widget.toggle` | `protectedProcedure` | `protectedProcedure` |
| `widget.updateOptions` | `protectedProcedure` | `protectedProcedure` |
| `widget.counter` | `publicProcedure` | `publicProcedure` |
| `widget.badge` | `publicProcedure` | `publicProcedure` |
| `widget.realtimeData` | `publicProcedure` | `publicProcedure` |

</details>

## PROOF 1 — the routing golden, before and after

Both runs on this box, 2026-09-06, `verification/harness start` up, the same
harness process restarted between them so no in-process cache crossed the swap.
`main.ts` was temporarily pointed back at `@openpanel/trpc` for the BEFORE run
and restored for the AFTER run; the golden reads the specifier out of `main.ts`
itself, so neither run needed a flag.

```
$ cd apps/api && bun run e2e/trpc-routing-golden.ts /tmp/trpc-routing-before.json
mounted router: @openpanel/trpc
probing 216 procedures across 28 routers at http://127.0.0.1:3333
     4  200 ok
    17  400 BAD_REQUEST
   195  401 UNAUTHORIZED
trpc-routing-golden: 216/216 reachable, 0 routing failure(s)      exit 0

$ cd apps/api && bun run e2e/trpc-routing-golden.ts /tmp/trpc-routing-after.json
mounted router: @openpanel/core
probing 217 procedures across 29 routers at http://127.0.0.1:3333
     5  200 ok
    17  400 BAD_REQUEST
   195  401 UNAUTHORIZED
trpc-routing-golden: 217/217 reachable, 0 routing failure(s)      exit 0
```

The diff of the two maps:

```
only in AFTER : ['health.live']
only in BEFORE: []
changed       : 0

shared paths identical: 216 / 216
  AFTER-only health.live {'type': 'query', 'status': 200, 'code': None}
```

**Empty except `health.live`.** Attempt 2's 176 differing paths, its three
401 → 200 and its one 401 → 500 are all gone, and the per-status tallies now
match on both sides (17 `BAD_REQUEST`, 195 `UNAUTHORIZED`, plus the 4 public
200s and core's fifth, `health.live`).

## PROOF 3 — the three holes, and the 500

The golden probes with an empty input, which is what let three missing checks
hide behind a zod rejection in attempt 2. Repeating that attempt's own
plausible-input probe — every **query** procedure, unauthenticated, input
`{projectId: 'proj_1', organizationId: 'org_1'}` — on both mounts, same box,
same day:

```
mounted: @openpanel/trpc  queries: 133      mounted: @openpanel/core  queries: 134
     2  200 ok                                   3  200 ok
     9  400 BAD_REQUEST                          9  400 BAD_REQUEST
   122  401 UNAUTHORIZED                       122  401 UNAUTHORIZED

changed:   0
identical: 133 / 133 shared query paths
core-only: health.live
```

Attempt 2 measured 68/133 identical here. It is now 133/133, and the third
core `200` is `health.live`, not a leaked endpoint.

The four named procedures, requested with no cookie and no credential:

```
--- GET /trpc/client.list?input={"json":{"projectId":"proj_1","organizationId":"org_1"}}
HTTP 401
{"error":{"json":{"message":"Not authenticated","code":-32001,
  "data":{"code":"UNAUTHORIZED","httpStatus":401,
  "stack":"TRPCError: Not authenticated\n    at packages/core/src/rpc/base.ts:129:15 ...

--- GET /trpc/subscription.getCurrent?input={"json":{"projectId":"proj_1","organizationId":"org_1"}}
HTTP 401   code UNAUTHORIZED   message "Not authenticated"

--- GET /trpc/subscription.usage?input={"json":{"projectId":"proj_1","organizationId":"org_1"}}
HTTP 401   code UNAUTHORIZED   message "Not authenticated"

--- GET /trpc/subscription.products?input={"json":{"projectId":"proj_1","organizationId":"org_1"}}
HTTP 401   code UNAUTHORIZED   message "Not authenticated"
```

`@openpanel/trpc` answers all four identically (`401 UNAUTHORIZED`,
`"Not authenticated"`, thrown at `packages/trpc/src/trpc.ts:38` rather than
`packages/core/src/rpc/base.ts:129`). `client.list` no longer returns the
project's ingestion clients — `secret` column included — to an anonymous
caller, and `subscription.products` no longer 500s.

## PROOF 2 — the auth contract suite, run against CORE

`verification/contracts/auth/run.sh` re-seeds, restarts the harness and targets
:3333, so with core mounted it tests core. Zero edits to `verification/`.

```
group (a) per-surface negative:            24 passed, 0 failed
group (b) getProjectAccess golden table:   17 passed, 0 failed
group (c) in-handler checks:               14 passed, 0 failed
group (d) enforceAccess shape triggers:     9 passed, 0 failed
group (e) cross-project share isolation:    7 passed, 0 failed
AUTH CONTRACTS: all 5 groups green
```

Group (d) is the one that could only ever have passed on the ported stack: it
asserts that a nested `projectId` does **not** trigger `enforceAccess` while a
top-level one does, that `readOnlyMutation` downgrades the demanded level to
read, and that the `organizationId` branch checks membership and not role.

## Verdict

The procedure-set diff is still exactly one line, `> health.live`. The routing
golden's diff is now empty except that same line. The plausible-input probe is
133/133 identical. All five auth-contract groups are green against core's
mount. **`apps/api` serves `@openpanel/core`'s router.**

Coverage is no longer 11/217: the routing golden reaches every procedure over
HTTP, and the 217 answers are pinned to V1's on the committed
`/tmp/trpc-routing-{before,after}.json` protocol. What it does not assert is
response *shape* — that is still the golden REST suite's job for `/insights`
and `/export`, and nothing's job for the other 27 routers.

Two V1 middlewares did **not** move with this task and are named here so they
are not assumed present: `rateLimitMiddleware` (10 `auth.*` procedures and
`organization.getInvite`) and `cacheMiddleware` (chart's 60s/300s and
overview's per-range TTLs). Both are already factories in `rpc/base.ts`
(`createRateLimitMiddleware`, `createCacheMiddleware`) awaiting a Redis handle
at the mount; wiring them is not in M11-001's scope and neither is visible to
any gate this task runs.

# @openpanel/core

Every route, procedure, job and rule the backend serves. `apps/api` is a shell
that mounts what this package exports and runs it as `ROLE=api|worker|all`.

This file is the scaffold's contract. It is written before the code it
describes, so a wave that lands a module does not get to rediscover any of it.
Architecture lives in the controller's `decisions/` (accepted ADRs are binding)
and `docs/TARGET_ARCHITECTURE.md`.

## Layout

```
src/
  index.ts            curated barrel — NOT export *
  context.ts          AppDeps | Ctx | HttpCtx | JobCtx + createCtx
  services.ts         Services INTERFACE + createServices(deps)
  logger.ts           structural Logger interface
  metrics.ts          the one prom-client registry
  rpc.router.ts       appRouter + export type AppRouter
  rest.routes.ts      publicApiRoutes | dashboardRoutes | opsRoutes
  jobs.registry.ts    queue registry + QueueProducers
  rpc/ http/ jobs/ ingest/ buffers/ clients/ shared/
  modules/<name>/     <name>.rpc.ts | .service.ts | .routes.ts | .jobs.ts
                      | .constants.ts | src/
```

The `<name>.` prefix stays on a module's root files and stops at its `src/`:
`Cmd+P report.service` lands one file, ten bare `service.ts` do not.

`rpc.router.ts`, `rest.routes.ts` and `jobs.registry.ts` **are** the registry.
There is no `defineModule()` and no filesystem auto-discovery — static
composition is what keeps tRPC's `AppRouter` and Elysia's route types alive.
Adding a module is one line per transport it actually has.

## The exports map

`package.json` declares exactly two entries, and that is the package's real
public API:

```json
"exports": {
  ".": "./src/index.ts",
  "./modules/*.constants": "./src/modules/*.constants.ts"
}
```

There is **no `./*` wildcard**. A service, a client, a buffer or the context is
not merely discouraged from being imported by `apps/start` or an SDK — it is
unreachable, because it is not exported. dependency-cruiser
(`.dependency-cruiser.cjs`, `pnpm run check:deps`) is the second layer, not the
only one.

The `*` matches `<module>/<module>`, so a report module's constants are
`@openpanel/core/modules/report/report.constants`. One star per key is all the
exports spec allows; putting the module name in the star twice is what buys the
`modules/<name>/<name>.constants.ts` layout without a hand-maintained entry per
module.

Measured on this scaffold (Bun 1.4.0, TypeScript 5.9 with
`moduleResolution: "bundler"`), with a throwaway `src/modules/report/` holding
one `report.constants.ts` and one `report.service.ts`:

```
$ bun -e "await import('@openpanel/core/modules/report/report.constants')"
RESOLVED [ "hour", "day" ]

$ bun -e "await import('@openpanel/core/modules/report/report.service')"
error: Cannot find module '@openpanel/core/modules/report/report.service'

$ bun -e "await import('@openpanel/core/context')"
error: Cannot find module '@openpanel/core/context'

$ bun -e "await import('@openpanel/core/modules/../../package.json')"
error: Cannot find module '@openpanel/core/modules/../../package.json'
```

and the same pair through `tsc --noEmit`, importing both paths from one file:

```
src/__exports_probe__.ts(2,30): error TS2307: Cannot find module
  '@openpanel/core/modules/report/report.service' or its corresponding type
  declarations.
```

Vite's resolver says the same thing in its own words, which is what
`apps/start` would see: `Missing "./context" specifier in "@openpanel/core"
package`.

Line 1 — the `*.constants` import — produced no error. Both fixtures were
deleted; nothing in this repo imports them. `test/exports-map.test.ts` keeps
the negative half as a regression gate (the wording of the failure varies —
resolved from inside the package it is `Cannot find package` — so it asserts
only that resolution fails).

If a frontend needs a value that is not vocabulary, the answer is to move the
value into a `*.constants.ts`, or to copy it into `apps/start`. It is never to
widen this map.

## Constants — the isomorphism rule

A `<name>.constants.ts` is the one file here a web app may import as a
**value**, so a form validates against the same schema the procedure enforces.
Limits, error codes, enums, zod schemas belong in it. Name a schema `zThing`
and the type inferred from it `Thing`. A prompt, a table name or a model id is
implementation, not vocabulary; it stays in `src/`.

The constraint is on imports, not on contents: **import zod, another
`*.constants.ts`, or nothing.** A `type`-only import of anything is fine —
it is erased. A Prisma type, a `node:` builtin or a date library follows the
import into a browser bundle silently, and the bundle still builds;
`constants-stay-isomorphic` fails the check instead.

`intervals` and friends are rewritten to plain `Date` math when they move here,
for exactly this reason.

## Tests

`bun:test`, from birth. vitest stays for `apps/start` only.

**`bun test --isolate`, deliberately.** Without it `bun test` shares one global
and one module registry across every file in the run. Three couplings this repo
already documents become live under sharing: two workspaces mutating the same
`integration-test` fixture project, `@/metrics` registering prom-client gauges
at import time, and the `event-buffer` → `event.service` import cycle. Vitest
isolated per file; keeping that removes "shared-process leakage" from the
suspect list while a structural port and a runtime swap are both in flight. It
costs a fresh global per file.

Measured on Bun 1.4.0, counting how many times one shared module evaluates
across two test files:

| Invocation | Evaluations |
| --- | --- |
| `bun test` | 1 — one registry, shared |
| `bun test --isolate` | 2 — fresh per file |
| `bun test --no-isolate` | 1 |
| `bunfig.toml` `[test] isolate = true`, no flag | **1 — silently ignored** |

So the flag is on the `test` script, not in `bunfig.toml`. Bun 1.4.0 warns
about neither an unknown key nor a wrong-typed one in `[test]`, so a
`bunfig.toml` that carried it would read as a guarantee and be none. **Invoke
the suite as `pnpm test` / `bun test --isolate`; a bare `bun test` is not the
configured suite.**

`bunfig.toml` `[test] preload` runs per test **process**, not once per run —
there is no `globalSetup` equivalent. `test/preload.ts` therefore does one
idempotent thing: pin `DATABASE_URL` / `CLICKHOUSE_URL` / `REDIS_URL` /
`SELF_HOSTED` at local values, so a test cannot reach production regardless of
what `.env` holds. Infrastructure fixtures stay out of it and are seeded per
suite by the suite that needs them (`test/fixtures.ts` at the repo root already
takes a project id for this), which is what lets the infrastructure-free files
run offline.

Bun resolves tsconfig `paths` natively, so `@/*` works with no alias config.

The root vitest workspace globs `packages/*`, and vitest cannot import
`bun:test`, so `vitest.config.ts` here sets `include: []` — core opts itself
out of the vitest run rather than the root opting it out.

### `mock.module` is not hoisted

`vi.mock` is hoisted above imports. `mock.module` applies at call time, and by
then any **import-time side effect** of the subject has already run — which is
the whole reason several of the tests being ported mock at all. The idiom, once,
everywhere:

```ts
import { beforeAll, expect, mock, test } from 'bun:test';

const createEvent = mock(async () => undefined);
mock.module('./event.service', () => ({ createEvent }));

let handler: typeof import('./ingest.jobs').handler;
beforeAll(async () => {
  ({ handler } = await import('./ingest.jobs'));
});

test('produces one event', async () => {
  await handler(job);
  expect(createEvent).toHaveBeenCalledTimes(1); // never optional — see below
});
```

Top-level `mock.module`, then `await import(...)` of the subject inside
`beforeAll`. A static `import` of the subject at the top of the file defeats it.

A mock that silently does not apply produces a **passing test that exercised the
real implementation**, so every mock-based test asserts the mock was called.
Break a new one once on purpose and confirm it goes red.

`vi.hoisted` has no successor and mostly dissolves: with `mock.module`
unhoisted, the value is declared on the line above. Env stubbing and typed mock
casts are one local helper each, not twenty call sites.

## ClickHouse — one `sql` tag

ClickHouse is raw SQL. There is no query builder in core, and `sqlstring` and
manual escaping are gone.

Static queries are written out and bound server-side with ClickHouse's own
`{name:Type}` parameters; `{name:Identifier}` covers a dynamic table or column
name. Dynamic composition — the chart engine, filters, breakdowns — uses typed
fragments from `@openpanel/db`'s `sql` tag, which carry their own params and
compose into auto-named `{pN:Type}` placeholders.

**A `${}` slot accepts only a `SqlFragment` or a `SqlParam`.** A bare string or
number is a compile-time type error, which is the point: SQL safety stops being
a per-call-site habit. Where `{x:Identifier}` cannot be used, `sql.id()`
validates against a whitelist and **throws** on a miss — it never falls back to
interpolation.

Two rules the tag cannot enforce:

**Never commit ClickHouse SQL you have not executed** against the local server,
and when replacing a query run both against the same data and diff the result
sets. "Looks equivalent" is not evidence.

**Local is one node; production is 2 shards × 2 replicas.** A plain
`IN (subquery)` against a `Distributed` table returns per-shard results — right
here, wrong in production. Read the controller's `docs/ENVIRONMENT.md` before
touching one.

If a query's dynamism genuinely cannot be expressed as fragments, a local,
function-scoped builder is allowed, provided its output still binds through
`{name:Type}` and carries one line saying why.

## Bun idioms

New and moved code uses `Bun.file` / `Bun.write` and `import.meta.dir` instead
of `node:fs` and the `fileURLToPath(import.meta.url)` dance. Existing `node:fs`
call sites are **not** swept — `node:fs` is a builtin under Bun and rewriting
working I/O deletes nothing.

Everything else Bun-native is a per-row decision, already made: passwords stay
`@node-rs/argon2`, hashing stays `node:crypto` (a `profileId` is a persisted
identity), Postgres stays Prisma, and core writes no direct `Bun.serve` call
because Elysia is one. Do not adopt a `Bun.*` API this file does not name.

## Style

Match the surrounding code; these are the rules that are not obvious from it.

**Comments only when really necessary, and VERY short.** Never narrate what the
code does — comment the *why*, plus APIs, non-obvious side effects and
invariants. The spec documents this package was ported from carry explanatory
comments because they are specs; production code does not inherit their comment
density.

**Single responsibility, sanely applied.** Focused functions, but do not shred
them: a coherent 100-line function beats twenty five-line fragments. Split
where a reader benefits, not to satisfy a metric.

**Constants over magic numbers**, named, at the top of the file or in the
module's `<name>.constants.ts`. **Meaningful names**, no abbreviations unless
universal.

**DRY at the narrowest level that fits**: inside the module first,
`src/shared/` when several backend modules need it, a dedicated package when
anything outside the backend needs it. Core is not a grab-bag for cross-app
code. Never invent a cross-module abstraction to deduplicate two call sites.

**Always think hot path.** This is an ingestion platform: `/track`, the Kafka
consumer and the buffers get no per-request work that could have been per-boot.

**Format with ultracite, only on the files you changed, named explicitly**
(`npx ultracite fix <files...>`). Never bare and never on `.` — the repo has
never been bulk-formatted.

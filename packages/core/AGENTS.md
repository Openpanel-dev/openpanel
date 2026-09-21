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
                      every factory is (deps, services) — see "Services"
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

## Services

`services.ts` is the composition root. Nothing else builds a service graph.

A service is a factory. No classes, no DI framework, no per-service interface:

```ts
export function createTenantService(deps: ServiceDeps, services: () => Services) {
  const { db, logger, queues, clients } = deps;

  // Private helpers first. Not in the returned object, so not on the type.
  const view = (row: TenantRow): TenantView => ({ ... });

  // Every public method has an EXPLICIT return type.
  async function get(tenantId: string): Promise<TenantView | null> { ... }

  async function storeMark(tenantId: string, bytes: Uint8Array): Promise<TenantMarkView> {
    const upload = await services().files.store({ ... });   // a sibling, lazily
    await clients.storage.put(upload.key, bytes, 'image/png');
    await queues.tenant.deriveMarkVariants.add({ tenantId });
    logger.info({ tenantId }, 'tenant mark stored');
    return view(...);
  }

  // The return line IS the module's index.
  return { get, storeMark };
}
```

Rules:

- **R3** — the signature is `(deps: ServiceDeps, services: () => Services)`, always. A factory
  that needs no sibling still takes the thunk, as `_services`, so the composition root stays a
  flat list. Reach any sibling through `services()`. Two services may call each other.
- **R4** — declare functions, then `return { one, two, three }`. That line is the index.
- **R5** — `Services` stays an `interface` whose members are `ReturnType<typeof createXService>`.
  Never hand-write `export interface XService`.

Both typing rules exist for one reason, and skipping either breaks the build in a confusing way:

1. `Services` must be an **interface**. A type alias over `ReturnType<typeof createServices>` is
   circular — resolving it needs every factory's signature, and every signature names `Services`.
   Interface members resolve lazily, which breaks the loop.
2. Every public method needs an **explicit return type**. TS derives a factory's type from
   signatures alone; an inferred return type that depends on `services()` forces it to check the
   body, which references `Services`, which references this factory → `ts7022`/`ts7023`. The error
   names the offending method, so it is quick to fix — but do not "fix" it by widening a type.

The cost this pays for: a frontend's `tsc` walks the server type graph to resolve `AppRouter`.
Explicit return types are what keep that tractable.

## Where the graph is built

Rebuilt per unit of work, never once at boot. It is object literals, no I/O — and it is what
makes `deps.logger` and `deps.queues` already bound to this request or job.

| Unit of work | Who builds it | Logger | Queues |
|---|---|---|---|
| procedure | the rpc mount | the request logger | scoped to the request id |
| plain route | lazily, on first `request.services` read | the request logger | scoped to the request id |
| job | the worker runtime, per job | child bound to queue/job/attempt/requestId | carries the job's meta onward |
| queue boot hook | the worker runtime | child bound to the queue | unscoped |
| the app's boot | `apps/api/src/main.ts` | the boot logger | unscoped |

**R6** — nothing outside those places calls `createServices`. A procedure and a job handler read
`ctx.services`; a plain route reads `request.services`. **There is no "no context" path.**

MCP and the assistant are not exceptions. They are mounted as ordinary routes
(`.use(mcpRoutes(deps))`, `.use(assistantRoutes(deps))`) and already hold `deps`. Their tool
handlers take a fixed SDK signature with no context parameter — that is a *closure* problem, not
a context problem. Build the server where `deps` is in hand (`createMcpServer(deps)`) and let the
handlers close over it. Never reach for a module-scope singleton.

**Lazy-load assets, never dependencies.** Reading a MaxMind `.mmdb` from disk on first use is
fine. Lazily importing a sibling service or a db handle you were already handed is the pattern
this package spent 2,104 lines of `v1-compat.ts` learning not to do.

## A module

```
src/modules/<name>/
  <name>.rpc.ts         procedures: schemas + one service call each
  <name>.service.ts     business logic; knows nothing about HTTP or rpc
  <name>.routes.ts      plain routes: webhooks, redirects, probes, file serving
  <name>.jobs.ts        queue: payload schemas + handlers
  <name>.constants.ts   isomorphic vocabulary (see the isomorphism rule above)
  src/                  everything else, plain names — no <name>. prefix inside src/
```

- **R1** — the `<name>.` prefix stays on root files and stops at `src/`.
- **R2** — take only the transports that have callers. A health module is routes-only. An
  integration has `rpc` (our dashboard), `routes` (the provider's webhooks), one `service` under
  both. Do not add an rpc file with no frontend caller.
- **R15** — a module joins the app by adding **one line** to each registry it needs
  (`rpc.router.ts`, `rest.routes.ts`, `jobs.registry.ts`, `services.ts`). Those registries plus
  the app's boot are the only construction sites in the codebase. Nothing in this package opens a
  socket, connection or client at import time.

## Layers

**R22** — imports only point downward, by *layer*, not by how many `../` a specifier has:

```
shared < clients < rpc/base, http/define, jobs/define < modules < services.ts < registries < index.ts
```

A module importing `defineJob` at `../../jobs/define` is going **down**. That is correct and
expected.

Two upward edges are legal, both type-only:

1. `ServiceDeps` / `Services` from the composition root — R3 requires them.
2. Another module's `<name>.constants.ts` — the isomorphism rule blesses that file.

Anything else pointing up is a bug: `shared/` importing `modules/`, or infrastructure
deep-importing `modules/<name>/src/*` instead of reaching behaviour through `deps`/`ctx`.

`shared/` is for helpers that need nothing above them. If a file in `shared/` needs
`ServiceDeps`, it is service infrastructure and is in the wrong directory. Truly dumb,
dependency-free helpers belong in `@openpanel/shared` (**R21**), not here.

## Procedures

A procedure is schemas plus one service call.

- **R10** — the builders carry auth and the common error catalogue. Do not write `requireLogin`
  or `requireReadAccess` in an rpc file; access checks live in the auth service and the builders.
- Declare the errors a procedure raises **on that procedure** — that is what types the error
  payload on the client.
- Business rules live in the service. The exception is a rule about the caller themself (for
  example, refusing to let an admin remove their own access), which reads better at the boundary.

## Clients

`src/clients/<name>.ts` is one transport each: config in, typed result or `ProviderError` out.

- **R9** — a client holds **no logger**. It is built once at boot, so it would capture the boot
  logger and every line would lose its request. Services log; theirs is bound.
- A missing thing is `null`, not an error.
- An optional API key means the client still builds and the first call throws. Construct the
  vendor SDK lazily.
- **R19** — `ProviderError.retryable` is load-bearing. The client classifies once (429 and 5xx
  retryable, 4xx not); a job handler rethrows a retryable failure and **logs** a permanent
  refusal, because a retry cannot change it.
- A client only one module will ever call may live in that module's `src/` instead.

## Queues

A `.jobs.ts` **declares**; it constructs nothing. No connection exists until the registry reaches
the producer or worker runtime.

- **R11** — payload schemas and handlers together, `cron`/`schedule` on the job (ADR-021). One
  way to enqueue, off the context. Enqueue **after** the transaction commits, never inside it.
- **R18** — a payload must survive a JSON round-trip (no `z.date()`). The worker re-parses it,
  because a job may have been enqueued by the previous deploy. The wire format is an envelope
  `{ payload, meta }` so the originating requestId follows a chain of jobs. Schedulers are
  registered by the **consumer** at worker boot, and retired ones removed. Deploy-owed work runs
  in a boot hook, not as a job — a job enqueued at boot can be taken by the old instance still
  draining.
- Every job runs at least once and may run twice. **The row is the state machine; the job only
  pokes it.**

## Config and lifecycle

- **R7** — nothing in this package reads `process.env`. New env goes in
  `apps/api/src/config/env.ts` and `.env.example`, and arrives here as a value.
- **R17** — that loader is one zod object: cross-field invariants as `.refine` *before* the
  `.transform`; every derived value (URLs, namespaces, `IS_PRODUCTION`) computed in the transform
  so nothing downstream re-derives it; a blank `KEY=` treated as absent; and the loader takes the
  environment **as a parameter** so a test can pass a minimal object.
- **R16** — whoever opens a connection closes it. This package never closes a connection it was
  handed. `apps/api/src/main.ts` shuts down in the exact reverse of the order it opened things.

## How a frontend consumes this

- **R12** — a web app imports exactly one thing from this package as a value: a module's
  `<name>.constants.ts`. Everything else arrives as `import type`, which is erased, so no server
  code reaches a browser bundle.
- Enforced by the `frontend-values-only-constants` cruiser rule and the SDK dist gate. If you
  find yourself needing a runtime helper in the dashboard, it belongs in `@openpanel/shared`
  (**R21**), not in an exception to this rule.

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

**Format with ultracite** (`npx ultracite fix <files...>`). The package is
formatted and safe-fixed as of 2026-09-21; a bare run only touches what
drifted, so it is fine, but the files you changed must come out clean.

# OpenPanel — agent guide

**If `WORKTREE.md` exists in the repo root, read it before anything else.** The tooling
that created this worktree generates it: URLs, ports, database names, the seeded login
and client secrets, where the process logs are and how to restart a process. Never guess
a URL or port — take them from `WORKTREE.md` or from your shell env (`$DASHBOARD_URL`,
`$API_URL`, `$DATABASE_URL`, `$CLICKHOUSE_URL`, `$REDIS_URL`).

Backend conventions (module layout, procedure builders, queues, tests) are the
contract in `packages/core/AGENTS.md`. Read it before touching `packages/core`.

## What this is

Open-source product analytics (a Mixpanel alternative). Bun monorepo.

| Path | What | Stack |
|---|---|---|
| `packages/core` | The backend: every module, the tRPC router, Elysia routes, BullMQ jobs, ingest | TypeScript |
| `apps/api` | Thin shell that mounts core; `ROLE=api\|worker\|all` picks what one process runs | Elysia on Bun |
| `apps/start` | The dashboard | TanStack Start, React 19, Redux Toolkit, Tailwind v4, Recharts |
| `packages/db` | Prisma (Postgres) + ClickHouse client and the `sql` tag (`src/clickhouse/sql.ts`) | |
| `packages/seed` | Deterministic seed data for Postgres + ClickHouse (`bun run seed`) | |
| `packages/redis`, `packages/email`, `packages/payments`, `packages/sdks/*` | Redis client/locks/pubsub, React Email, billing, client SDKs | |
| `apps/public` | Marketing + docs | Next.js, Fumadocs |

Data flow: SDK → `POST /track` (`packages/core/src/modules/ingest`) → Kafka → the
worker role → ClickHouse (`events`, `sessions`, `profiles`, materialized views).
Dashboard → tRPC (`$API_URL/trpc`) → ClickHouse for analytics, Postgres for config.

## Your environment

You are usually inside a **worktree** under `.worktrees/<name>` with its own port block,
its own Postgres/ClickHouse database (`openpanel_<name>`), Redis db index and Kafka
topics. `WORKTREE.md` says which, and whether the processes (`web`, `api`, `studio`) are
supervised for you.

- **Supervised processes**: `WORKTREE.md` gives the log files and the exact restart
  command. Prefer restarting over starting your own copy — two processes on one port is
  the usual cause of "my change does nothing". If the supervisor is gone, your shell has
  the same env it used, so `bun run --filter @openpanel/api dev` (or `start`) starts a
  process on the right port. `tail -f` the log while you test.
- Env is injected into your shell and wins over `.env`; `.env` in a worktree is a copy of
  the main checkout's and mostly irrelevant.
- Never point at another worktree's database or edit files under `.worktrees/`.
- Migrations: `bun run --filter @openpanel/db migrate:deploy` runs both Prisma and the
  ClickHouse code migrations against *your* databases (already run when the worktree was
  created and seeded).

Without `WORKTREE.md` you are in a plain checkout: `.env` applies, `bun run dock:up`
starts Postgres/Redis/ClickHouse/Redpanda, and `bun run dev` starts api + dashboard.
The dashboard's server side runs under the Cloudflare Vite plugin, which reads
`apps/start/.env.local` (and wrangler `vars`) rather than your shell — set `API_URL` and
`DASHBOARD_URL` there, or export `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` to make it use
the shell env.

## Data

- `bun run seed` — seeds a user, organization, projects and clients into Postgres and
  realistic events/sessions/profiles into ClickHouse. `--size small` (default, ~14
  days), `medium`, `large`, `xl` (tens of millions of events, for query-performance
  work), or `--days N --sessions-per-day N`. `--reset` wipes the seeded projects first.
  Same `--seed` ⇒ identical data. `--dry-run` prints the row estimate.
- `.seed.json` (gitignored, repo root) holds what was seeded: login, organization and
  project ids, client ids and secrets, and per project which funnels and breakdowns the
  data is built to show. `WORKTREE.md` repeats the important ones. The four projects
  (web, SaaS, shop, app) differ in identity: only identified projects have retention;
  see `packages/seed/README.md`.
- Direct database access: `bun run --filter @openpanel/db studio` (Prisma Studio on
  `$STUDIO_PORT`), or `psql "$DATABASE_URL"` / `clickhouse-client` / `redis-cli` with the
  URLs from your env.

## How to verify your work

Verify like a user would, then like CI would. Pick the rows that match what you changed;
a one-line fix does not need the full suite, a query or ingest change always does.

| You changed | Verify with | Also run |
|---|---|---|
| Dashboard UI (`apps/start`) | Open `$DASHBOARD_URL` with the Playwright MCP if you have one (`browser_*` tools; the local HTTPS certificate is self-signed, ignore that), log in with `.seed.json`, use the feature, **take a screenshot** (`browser_take_screenshot`; you get the image back — look at it) | `bunx vitest run` in `apps/start`, then add/adjust a spec in `apps/start/e2e/` and `bun run e2e` |
| tRPC procedure / REST route (`packages/core`) | Call it (recipes below) with seeded ids and check the JSON; for auth changes, try the wrong role too | `bun test --isolate` in `packages/core` for that module |
| ClickHouse query / chart / overview | Run old and new against the seeded data and diff results; check the numbers on the dashboard match a manual query | `packages/core` tests for the module; `bun run --filter @openpanel/db test` if you touched `packages/db` |
| Ingest / worker / buffers / sessions | `bun run send journey --project acme-shop` (live events through Kafka → worker → ClickHouse), then query `events`/`sessions`/`profiles` for that session id | `packages/core` ingest + buffer tests, `apps/api/e2e/` for session lifecycle |
| MCP tools (`packages/core/src/modules/mcp`) | Call the product's MCP against *your* API and data: as the `openpanel` MCP server if one is configured for you, else over HTTP (`.seed.json` → `mcp.url`, recipe below); compare its answer with a direct query | `packages/core` mcp tests |
| Schema / migration | `bun run --filter @openpanel/db migrate:deploy` on your isolated database, then `bun run seed --reset` and the seed tests (`bun run --filter @openpanel/seed test`) | `bun run typecheck` |
| Anything shared (`packages/shared`, `packages/db`, config, deps) | — | `bun run typecheck` and `bun run test` in full |

Always before you finish: `bun run typecheck`, and `npx ultracite fix <files you changed>`
(the repo is formatted and safe-fixed as of 2026-09-21, so a bare `bun run fix` is also
fine; `bun run check` still reports a few hundred lint errors that need judgment, so only
the files you touched have to come out clean). Report what you ran and what you saw;
a screenshot or a query result is evidence, "should work" is not.

Sending real events (`bun run send`, uses the seeded clients and `$API_URL`):

```bash
bun run send journey --project acme-shop --sessions 2   # replay a generated journey live
bun run send track purchase --project acme-shop --path /order/1 --prop value=99 --prop payment=card --revenue 99
bun run send identify usr_123 --project acme-saas --email a@b.co --first-name Ada --prop plan=pro
```

Request recipes (ids and secrets from `.seed.json`):

```bash
# Track through the real pipeline
curl -sS -X POST "$API_URL/track" \
  -H 'content-type: application/json' \
  -H "openpanel-client-id: $CLIENT_ID" -H "openpanel-client-secret: $CLIENT_SECRET" \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36' \
  -H 'x-client-ip: 81.2.69.142' \
  -d '{"type":"track","payload":{"name":"screen_view","properties":{"__path":"/pricing"}}}'

# Management API (root client)
curl -sS "$API_URL/manage/projects" -H "openpanel-client-id: $ROOT_ID" -H "openpanel-client-secret: $ROOT_SECRET"

# tRPC as the seeded user: sign in, keep the `session` cookie, call any procedure
curl -sS -c cookies.txt -X POST "$API_URL/trpc/auth.signInEmail" -H 'content-type: application/json' \
  -d '{"json":{"email":"admin@openpanel.local","password":"openpanel"}}'
curl -sS -b cookies.txt "$API_URL/trpc/organization.list"

# The product's MCP (streamable HTTP; url with token is `.seed.json` → mcp.url)
curl -sS -X POST "$MCP_URL" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Payload shapes for `/track` are in `packages/core/src/modules/ingest/ingest.constants.ts`.
`apps/api/e2e/` is an HTTP harness for session-lifecycle stress tests.

### Splitting verification across sub-agents

Default: verify your own change yourself; it is small and you have the context. Spawn
sub-agents only when the change touches several surfaces at once (API + dashboard + MCP,
or a query used in many reports) — then one sub-agent per surface, in parallel, each with a
concrete checklist ("open X, do Y, expect Z; report the numbers/screenshot"). They share
your worktree and databases, so they must not migrate, reseed or restart processes; only
you do that, before they start. Merge their reports into yours; do not forward them raw.

## How to find things

- A backend module is `packages/core/src/modules/<name>/` with `<name>.rpc.ts`
  (tRPC), `.routes.ts` (REST), `.jobs.ts` (BullMQ), `.service.ts`, `.constants.ts`
  (zod schemas + constants, safe to import from the frontend). `Cmd+P report.service`.
- Dashboard routes: `apps/start/src/routes/` (TanStack file routing); modals in
  `src/modals/`; tRPC client in `src/integrations/tanstack-query/`.
- ClickHouse queries use the `sql` tag from `@openpanel/db` (`packages/db/src/clickhouse/sql.ts`).
  Table names: `packages/db/src/clickhouse/client.ts` (`TABLE_NAMES`). Schema: the
  numbered files in `packages/db/src/code-migrations/`; a flat copy is `test/clickhouse-schema.sql`.
- Env schema: `apps/api/src/config/env.ts`. Auth: `packages/core/src/modules/auth/`.
- The write path (what ends up in ClickHouse): `packages/core/src/modules/event/event.service.ts`
  (`createEvent`), `packages/core/src/buffers/session-buffer.ts`, `profile-buffer.ts`.

## ClickHouse

Local is a single node; production is sharded (2 shards × 2 replicas, `Distributed`
tables). A plain `IN (subquery)` on a distributed table silently returns per-shard
results — use `GLOBAL IN` or a join. Never commit ClickHouse SQL you have not run
against your worktree's database; when replacing a query, diff old and new results
on the same data.

## Code style

Formatting and linting is ultracite (Biome 2). Do not hand-format against it and do not
disable rules to make a check pass. Generated and vendored files are excluded in
`biome.json`; add to that list rather than reformatting build output.

- Constants over magic numbers: named, at the top of the file or in the module's
  `<name>.constants.ts`.
- Names reveal purpose; no abbreviations unless universal.
- Comments say *why*, briefly. Never narrate what the code does. If a function needs
  a comment to explain what it does, split it.
- Single responsibility, early returns, no nested ternaries, extract conditions into
  named booleans.
- DRY at the narrowest level that fits: the module first, `packages/core/src/shared/`
  when several backend modules need it, a dedicated package when the frontend or SDKs
  need it too. Do not invent a cross-module abstraction for two call sites.
- `unknown` over `any`; `as const`; narrowing over assertions; `for…of` over `forEach`.
- React: function components, hooks at top level, `key` from ids, ref as a prop
  (React 19), semantic elements with labels and keyboard handlers.
- No `console.log` / `debugger` left behind. Throw `Error` objects.

Leave the code you touch cleaner than you found it — inside the task's scope only.
Do not refactor, upgrade dependencies or fix unrelated things you notice; mention
them instead.

## Git

One branch per worktree, created from `rewrite/v2`. Commit when a step is done and
verified, with a message that says what and why. Never push, never add
remotes, never rewrite history that is not yours. `WORKTREE.md`, `.seed.json` and
`.worktree-*` are gitignored — keep them that way.

## Ralph

If `/home/deploy/rewrite-openpanel` exists you are the autonomous rewrite loop:
`CLAUDE.ralph.md` overrides this file.

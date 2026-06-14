# OpenPanel — Agent Guide

OpenPanel is an open-source web & product analytics platform (a Mixpanel /
Plausible / Google Analytics alternative). It ingests events from client SDKs,
processes them through a queue + worker pipeline into ClickHouse, and serves a
real-time analytics dashboard. It is a **pnpm monorepo** (`pnpm@10.6.2`,
Node 22+) with workspaces `apps/*`, `packages/**`, `tooling/*`, `admin`.

This file is an **index**, not a manual. Detailed docs live in [`docs/`](docs/README.md);
end-user product docs live in [`apps/public/content/docs`](apps/public/content/docs).

## Repo map

| Path | What it is | Doc |
|---|---|---|
| `apps/api` | Fastify v5 server: SDK event ingestion (`/track`) + dashboard tRPC + WebSocket. | [apps-api.md](docs/apps-api.md) |
| `apps/start` | Dashboard UI: TanStack Start (React 19 + Vite), tRPC + React Query. | [apps-dashboard.md](docs/apps-dashboard.md) |
| `apps/worker` | Background jobs + crons: event processing, sessions, buffer flush to ClickHouse, alerts (BullMQ + GroupMQ). | [apps-worker.md](docs/apps-worker.md) |
| `apps/public` | Next.js marketing site + canonical product docs. | [apps-public.md](docs/apps-public.md) |
| `packages/db` | Dual-DB layer: Prisma (Postgres) + ClickHouse `clix` builder + chart engine + services. | [database.md](docs/database.md) |
| `packages/sdks` | Client SDKs: core `sdk` → `web`/`react-native`/`express`; `web` → `nextjs`/`astro`. | [sdks.md](docs/sdks.md) |
| `packages/{auth,trpc,validation,common,constants,json}` | Core: session/OAuth auth, 20+ tRPC routers, Zod schemas, utilities, enums, SuperJSON. | [packages-core.md](docs/packages-core.md) |
| `packages/{queue,redis,email,geo,integrations,payments,importer,logger}` | Services: queues, cache/pubsub, email, geolocation, Slack, billing, import, logging. | [packages-services.md](docs/packages-services.md) |
| Docker / CI / self-hosting | Multi-stage Docker → Azure ACR; docker-compose / Coolify + Caddy. | [deployment.md](docs/deployment.md) |

Cross-cutting end-to-end narrative: [docs/architecture.md](docs/architecture.md).

## Architecture in 30 seconds

- **Write path:** client SDK `POST /track` → `apps/api` (validate client, bot
  filter, resolve device id) → enqueue on Redis/GroupMQ (grouped by `projectId`,
  ordered) → `apps/worker` (enrich geo/UA, manage sessions, write Redis list
  buffers) → cron flushes buffers in batches to **ClickHouse**.
- **Read path:** `apps/start` → tRPC (`@openpanel/trpc`, 20+ routers) → metadata
  from **Postgres (Prisma)**, analytics from **ClickHouse** via the chart engine.
- **Live:** WebSocket (`apps/api/src/routes/live.router.ts`) for real-time
  events/visitors, with back-pressure dropping of slow clients.
- **Sessions:** created on first event; `session_end` scheduled ~30 min out,
  delay resets per event; triggers session_end + notification rules on timeout.
- **`@openpanel/db` is the single gateway to both datastores** (Prisma + `clix`).

Full detail: [docs/architecture.md](docs/architecture.md).

## Essential commands

```bash
cp .env.example .env          # set NITRO=1 for local dev (see gotchas)
pnpm install
pnpm codegen                  # Prisma client + geo db (run before apps)
pnpm migrate                  # Prisma dev migration
pnpm -r --filter db run migrate:deploy:code   # ClickHouse code-migrations (--cluster for clustered)

pnpm dev                      # runs API + Worker (parallel "testing" scripts)
pnpm --filter start dev       # dashboard on :3000 (run separately)

pnpm lint:fix                 # Biome
pnpm typecheck                # TS
pnpm test                     # Vitest
```

Ports: **Dashboard** http://localhost:3000 · **API** http://localhost:3333 ·
**Worker** http://localhost:9999 (BullBoard).

## Conventions & gotchas an agent must know

- **ClickHouse queries MUST use the custom query builder** at
  `packages/db/src/clickhouse/query-builder.ts` (`.cursorrules`) — not raw SQL
  strings. Use `sqlstring.escape()` for raw values; pass timezone to `clix(ch, tz)`.
- **Datastore split:** Postgres (Prisma) = app/business metadata; ClickHouse =
  analytics events/profiles/sessions; Redis = queue/cache/pubsub/buffers.
  Two separate migration systems (Prisma migrations + numbered ClickHouse
  code-migrations in `packages/db/code-migrations/`).
- **`apps/start/src/routeTree.gen.ts` is auto-generated** by
  `@tanstack/router-plugin` — do not edit; run `pnpm dev` to regenerate.
- **`NITRO=1` is required in `.env` for local dev** — skips the Cloudflare
  plugin in Vite (prod uses Cloudflare Workers).
- **Deploy:** merging to `main` builds Docker images (changed apps only) and
  auto-deploys to **dev**; include **`#d2p-openpanel`** in the merge commit to
  also deploy **prod**. Release is cut by a `#tag` commit.
- **`docker-compose.yml` is infra-only** (Postgres/ClickHouse/Redis/Dragonfly);
  apps run on the host via `pnpm` during local dev, not in containers.
- **tRPC procedures:** `publicProcedure` (no auth) vs `protectedProcedure`
  (auth → access → logging → sessionScope). Access control lives in `@openpanel/db`.
  Redis per-procedure caching; chart queries use 1h staleTime in React Query.
- **Redux in the dashboard holds only chart-builder state**; all server state
  goes through React Query / tRPC. tRPC client sends `credentials: 'include'`
  (cookie auth) — verify CORS / `DASHBOARD_URL` cookie domain if auth breaks.
- **Device IDs** hash current+previous salt + IP + UA (salt rotation preserves
  continuity); timestamps validated ±1 min future / ±15 min past.
- **Worker env knobs:** `ENABLED_QUEUES` filters which queues start;
  `ENABLE_SHARD_DISTRIBUTION=true` auto-partitions event shards across K8s pods;
  `SELF_HOSTED=true` skips cloud-only behavior; `DISABLE_BULLBOARD=1` hides the UI.
- **Self-hosting image mismatch:** this fork builds to Azure ACR, but the
  self-hosting compose templates reference `lindesvard/*` on Docker Hub — adjust
  image refs if self-hosting this fork (see [deployment.md](docs/deployment.md)).
- **Pre-push hook runs typecheck + test**; override with `SKIP_HOOKS=1`.

## Where to look

- Detailed developer docs: [`docs/`](docs/README.md) (start at
  [architecture.md](docs/architecture.md)).
- End-user / product docs: [`apps/public/content/docs`](apps/public/content/docs).

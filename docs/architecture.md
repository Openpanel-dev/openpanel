# OpenPanel — System Architecture

This is the end-to-end architecture narrative for OpenPanel: how the apps, shared
packages, and datastores fit together, and how an analytics event travels from a
client SDK all the way to ClickHouse and back out to the dashboard.

For per-component detail, see the component docs in [`docs/`](./README.md).

---

## 1. High-level component diagram

```mermaid
flowchart LR
  subgraph Clients["Client SDKs (packages/sdks)"]
    WEB["web / nextjs / astro"]
    RN["react-native"]
    SRV["express / server"]
  end

  subgraph Apps
    API["apps/api\nFastify v5\n• /track (SDK ingest)\n• tRPC + WebSocket (dashboard)"]
    WORKER["apps/worker\nBullMQ + GroupMQ\ncrons + buffer flush"]
    START["apps/start\nTanStack Start dashboard"]
    PUBLIC["apps/public\nmarketing + product docs"]
  end

  subgraph Datastores
    PG[("PostgreSQL\nPrisma\napp metadata")]
    CH[("ClickHouse\nevents / profiles / sessions")]
    REDIS[("Redis\ncache · queue · pub/sub")]
  end

  WEB & RN & SRV -->|POST /track| API
  API -->|enqueue events| REDIS
  REDIS -->|GroupMQ events| WORKER
  WORKER -->|Redis list buffers -> batch insert| CH
  WORKER --> PG

  START -->|tRPC over HTTP| API
  START <-->|WebSocket live| API
  API -->|@openpanel/trpc| PG
  API -->|@openpanel/db chart engine| CH
  API <-->|sessions · rate limit · cache · pub/sub| REDIS

  classDef store fill:#eef,stroke:#446;
  class PG,CH,REDIS store;
```

ASCII fallback:

```
 SDKs ──POST /track──▶  apps/api ──enqueue──▶ Redis (GroupMQ) ──▶ apps/worker ──batch──▶ ClickHouse
                          │  ▲                                        │
                          │  └──────── tRPC / WS ───── apps/start     └──▶ PostgreSQL (metadata)
                          │
                          └── reads: Postgres (Prisma) + ClickHouse (chart engine), Redis (cache/sessions)
```

---

## 2. The event lifecycle (write path)

End-to-end, no single component owns this — it crosses SDK, API, queue, worker,
and ClickHouse.

1. **Client SDK fires an event.** The core SDK (`packages/sdks/sdk/src/index.ts`)
   exposes `track`, `identify`, `increment`, `decrement`, `revenue`. The browser
   SDK (`packages/sdks/web`) adds automatic screen views, outgoing-link tracking,
   and rrweb session replay (`packages/sdks/web/src/replay/recorder.ts`). All
   send `POST /track` via the HTTP client `packages/sdks/sdk/src/api.ts`, with
   `openpanel-client-id` / `openpanel-client-secret` / `openpanel-sdk-name` /
   `openpanel-sdk-version` headers. The keepalive
   flag is disabled for bodies > 60,000 bytes (~58.6 KB) (large replay chunks).

2. **Ingestion in apps/api.** The legacy v2 endpoint
   (`apps/api/src/routes/track.router.ts`) handles the full event-type enum;
   the modern v3 endpoint (`apps/api/src/routes/event.router.ts`) is a unified
   ingest. The client hook (`apps/api/src/hooks/client.hook.ts`) validates
   client ID/secret and CORS; the bot hook (`apps/api/src/hooks/is-bot.hook.ts`)
   filters bots using a pre-compiled pattern list + LRU cache
   (`apps/api/src/bots/index.ts`). The track controller
   (`apps/api/src/controllers/track.controller.ts`) resolves the device ID
   (hash of salt + IP + UA, with current+previous salt for rotation continuity),
   validates the timestamp (±1 min future, ±15 min past), and enqueues the event.

3. **Queue (Redis / GroupMQ).** Events are enqueued onto GroupMQ
   (`packages/queue/src/queues.ts`), grouped by `projectId` (or server request
   ID) and mapped to a deterministic shard via SHA1 hash. Grouping preserves
   per-project ordering so session integrity is maintained.

4. **Worker processing.** `apps/worker/src/jobs/events.incoming-event.ts`
   parses and validates each event, enriches it with geo (`@openpanel/geo`) and
   user-agent data, and manages sessions: a session is created on the first
   event, and a `session_end` job (`events.create-session-end.ts`) is scheduled
   ~30 min out (job id `sessionEnd:${projectId}:${deviceId}`, delay resets on each
   new event). Processed events are appended to Redis list buffers
   (`eventBuffer`, `profileBuffer`, `sessionBuffer`, `replayBuffer`, `botBuffer`).

5. **Buffer flush → ClickHouse.** Cron jobs (`apps/worker/src/boot-cron.ts`)
   flush the Redis buffers every few seconds via the base buffer class
   (`packages/db/src/buffers/base-buffer.ts`), using a Redis lock to prevent
   concurrent flushes and parallel ClickHouse inserts. Events land in the
   ClickHouse `events` table (time-partitioned ReplicatedMergeTree); profiles
   use ReplacingMergeTree snapshots.

Sharding can auto-partition across Kubernetes pods when
`ENABLE_SHARD_DISTRIBUTION=true` (pod index derived from `HOSTNAME`).

---

## 3. The read path (dashboard queries)

1. **Dashboard (apps/start).** TanStack Start (React 19 + Vite) with file-based
   routing (`apps/start/src/routes/`, auto-generated `apps/start/src/routeTree.gen.ts`). Server
   state comes through a tRPC client integrated with React Query
   (`apps/start/src/integrations/tanstack-query/root-provider.tsx`,
   `apps/start/src/trpc/client.ts`). Local chart-builder state lives in a single
   Redux slice (`apps/start/src/redux/index.ts`); everything server-side is
   React Query. Live updates flow over WebSocket.

2. **tRPC backend (@openpanel/trpc).** The root router
   (`packages/trpc/src/root.ts`) aggregates 20+ domain routers (chart, report,
   auth, project, org, cohort, …). Context, middleware (auth → access → logging →
   cache), and procedure types live in `packages/trpc/src/trpc.ts`. Requests are
   served by apps/api alongside the SDK ingest endpoints.

3. **Data fetch.** Metadata reads go to PostgreSQL via Prisma
   (`packages/db/src/prisma-client.ts`). Analytics reads go to ClickHouse
   through the chart engine pipeline (`packages/db/src/engine/`:
   normalize → plan → fetch → compute → format) and the services layer
   (`packages/db/src/services/`). ClickHouse queries are built with the custom
   `clix` query builder (`packages/db/src/clickhouse/query-builder.ts`).

4. **Live / WebSocket.** `apps/api/src/routes/live.router.ts` and
   `live.controller.ts` push real-time events/visitors with back-pressure
   handling (slow clients dropped; buffered events > 1 MB discarded).

---

## 4. Datastore split

| Store | Tech | Role |
|---|---|---|
| **PostgreSQL** | Prisma (`packages/db/prisma/schema.prisma`) | App / business metadata: organizations, projects, users, reports, dashboards, cohorts, custom events, imports, materialized-column metadata. Transactional. |
| **ClickHouse** | `clix` builder + code-migrations (`packages/db/code-migrations/`) | OLAP analytics: `events` (ReplicatedMergeTree, time-partitioned), `profiles` (ReplacingMergeTree), `sessions`, `cohort_members`, materialized views. Billions of rows, sub-second queries. |
| **Redis** | ioredis (`packages/redis`) | Queue backend (GroupMQ + BullMQ), L1/L2 cache, rate limits, pub/sub, list buffers, sessions. |

Two independent migration systems exist: Prisma migrations (auto-generated SQL)
and hand-written numbered ClickHouse code-migrations
(`packages/db/code-migrations/`, run via `pnpm db migrate:deploy:code`).
Clustered mode (ReplicatedMergeTree + Distributed) vs. self-hosted single-table
DDL is detected at migration time (`packages/db/src/clickhouse/migration.ts`).

---

## 5. Workspace dependency overview

```
apps/api      ── @openpanel/trpc, db, redis, auth, queue, common, geo, validation, logger
apps/worker   ── @openpanel/db, queue, redis, logger, common, integrations, importer, email, json
apps/start    ── @openpanel/trpc, common, constants, validation, integrations, payments
apps/public   ── @openpanel/nextjs, common, geo, payments, sdk-info

@openpanel/trpc        ── db, redis, email, integrations, payments, queue
@openpanel/db          ── common, constants, json, logger, redis, queue, validation
@openpanel/auth        ── (session/OAuth: Argon2, Arctic)
@openpanel/queue       ── redis (GroupMQ + BullMQ definitions, shard picking)
@openpanel/redis       ── cache (L1 LRU + L2 Redis), pub/sub, client factories
@openpanel/validation  ── constants (Zod schemas; split by domain to avoid cycles)
@openpanel/common      ── (date/id/url/ua/ip/crypto utilities; client + server entry)

packages/sdks: sdk (core) ← web ← {nextjs, astro};  sdk ← {react-native, express}
```

Key foundational packages:

- **@openpanel/db** — the single gateway to both datastores: Prisma client,
  ClickHouse client + `clix` builder, chart engine, and 18+ services
  (`packages/db/index.ts`). Used by API and Worker alike.
- **@openpanel/trpc** — the dashboard's entire API surface.
- **@openpanel/queue** + **@openpanel/redis** — the event-pipeline backbone.
- **@openpanel/validation** + **@openpanel/constants** — shared Zod schemas and
  UI enums used across dashboard, tRPC, and db.

---

## 6. Where to go next

- API & ingestion: [`docs/apps-api.md`](./apps-api.md)
- Dashboard: [`docs/apps-dashboard.md`](./apps-dashboard.md)
- Worker & queues: [`docs/apps-worker.md`](./apps-worker.md)
- Public site / product docs: [`docs/apps-public.md`](./apps-public.md)
- Database layer: [`docs/database.md`](./database.md)
- SDKs: [`docs/sdks.md`](./sdks.md)
- Core packages: [`docs/packages-core.md`](./packages-core.md)
- Service packages: [`docs/packages-services.md`](./packages-services.md)
- Build & deployment: [`docs/deployment.md`](./deployment.md)

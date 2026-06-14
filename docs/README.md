# OpenPanel — Developer Documentation

OpenPanel is an open-source web & product analytics platform (a Mixpanel /
Plausible / Google Analytics alternative), built as a pnpm monorepo
(`pnpm@10.6.2`, Node 22+).

This folder is the **developer** documentation: how the codebase is built and how
the pieces fit together. For the **end-user / product** documentation (getting
started, SDK usage, self-hosting guides as published on openpanel.dev), see the
canonical product docs in
[`apps/public/content/docs`](../apps/public/content/docs).

Start with the [**architecture overview**](./architecture.md) for the
end-to-end system narrative (event lifecycle, datastore split, package
dependencies). Then dive into a component below.

## Apps

| Component | Doc | One-liner |
|---|---|---|
| API: Event Ingestion & tRPC Backend | [apps-api.md](./apps-api.md) | Fastify v5 HTTP server that ingests analytics events from SDKs and powers the dashboard via tRPC + WebSocket APIs. |
| Dashboard (apps/start) | [apps-dashboard.md](./apps-dashboard.md) | User-facing analytics dashboard built with TanStack Start (React 19 + Vite) and TanStack Router. |
| Worker (apps/worker) | [apps-worker.md](./apps-worker.md) | Background job processor and cron scheduler for event ingestion, sessions, batch ClickHouse inserts, and alerting. |
| Public site (apps/public) | [apps-public.md](./apps-public.md) | Next.js marketing website and canonical product documentation for OpenPanel. |

## Data & Packages

| Component | Doc | One-liner |
|---|---|---|
| Database Layer (Prisma + ClickHouse) | [database.md](./database.md) | Dual-database persistence: PostgreSQL via Prisma for app metadata, ClickHouse for OLAP analytics events and profiles. |
| Client SDKs (packages/sdks) | [sdks.md](./sdks.md) | Client tracking SDKs for web, mobile, and server-side platforms wrapping the core API (events, sessions, replay). |
| Core packages (auth, trpc, validation, common, constants, json) | [packages-core.md](./packages-core.md) | Shared foundations: session/OAuth auth, 20+ tRPC routers, Zod validation, common utilities, UI constants, JSON serialization. |
| Service packages (queue, redis, email, geo, integrations, payments, importer, logger) | [packages-services.md](./packages-services.md) | Infrastructure services: job queuing, caching, transactional email, IP geolocation, Slack, billing, data import, logging. |

## Infra

| Component | Doc | One-liner |
|---|---|---|
| Build, Deployment & Infrastructure | [deployment.md](./deployment.md) | Containerized CI/CD (Docker → Azure ACR), local dev via docker-compose infra, self-hosting via docker-compose or Coolify with Caddy. |

---

- **Cross-cutting architecture:** [architecture.md](./architecture.md)
- **Product / end-user docs:** [`apps/public/content/docs`](../apps/public/content/docs)
- **Agent quick-start / repo index:** [`../CLAUDE.md`](../CLAUDE.md)

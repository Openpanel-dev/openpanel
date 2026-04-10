# Local Development Setup

## Prerequisites

- Node.js v22+
- pnpm 10.6.2 (`npm install -g pnpm@10.6.2`)

## Setup

1. Copy the example env and fill in dev credentials:

```bash
cp .env.example .env
```

Update `.env` with dev database URLs:

```
REDIS_URL="rediss://:<password>@<dev-redis-host>:6380?ssl_cert_reqs=required"
DATABASE_URL="postgresql://<user>:<pass>@<dev-postgres-host>:5432/openpanel?sslmode=require"
DATABASE_URL_DIRECT="<same as DATABASE_URL>"
CLICKHOUSE_URL="https://<user>:<pass>@<dev-clickhouse-host>:<port>"
CLICKHOUSE_SETTINGS_REMOVE_CONVERT_ANY_JOIN="true"
SELF_HOSTED="true"
VITE_SELF_HOSTED="true"
NITRO="1"
```

2. Install dependencies:

```bash
pnpm install
```

3. Generate Prisma client:

```bash
pnpm codegen
```

## Running

Start API and Worker:

```bash
pnpm dev
```

Start Dashboard (separate terminal):

```bash
pnpm --filter start with-env vite dev --port 3000
```

- Dashboard: http://localhost:3000
- API: http://localhost:3333
- Worker: http://localhost:9999

## Deployment

Merge to `main` triggers:
- Docker image build (only for changed apps)
- Auto-deploy to dev (restarts only affected pods)

To also deploy to prod, include `#d2p-openpanel` in the merge commit message.

## Notes

- `NITRO=1` is required in `.env` to skip the Cloudflare plugin during local dev
- The `CLICKHOUSE_SETTINGS_REMOVE_CONVERT_ANY_JOIN=true` flag is needed for newer ClickHouse versions
- Redis warnings about eviction policy and version are non-blocking

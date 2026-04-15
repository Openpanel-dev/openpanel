# OpenPanel — Local Development Setup (for Andy)

This is a step-by-step to get OpenPanel running on your Mac so you can see the
fixes in action against a local, empty database. Once it's working, we'll
figure out the path to load Pin Drop's live data into it.

## 1. Prerequisites

Install these once if you don't already have them:

- **Docker Desktop** — https://www.docker.com/products/docker-desktop/
  After install, open it once so the docker daemon is running.
- **Node.js 20+** — easiest via https://github.com/nvm-sh/nvm:
  `nvm install 20 && nvm use 20`
- **pnpm** (package manager this repo uses):
  `npm install -g pnpm@10.6.2`

Verify in a Terminal:

```bash
docker --version    # any recent version is fine
node --version      # v20.x
pnpm --version      # 10.x
```

## 2. Set up the project

Open Terminal and `cd` into the repo:

```bash
cd /Users/andy/Websites/openpanel
```

Create a `.env` file from the example. The defaults match the docker-compose
services so you don't need to change anything:

```bash
cp .env.example .env
```

Install dependencies (this takes a few minutes the first time):

```bash
pnpm install
```

## 3. Start the databases

Postgres, ClickHouse and Redis all run in Docker. One command:

```bash
pnpm dock:up
```

To check they're up:

```bash
docker compose ps
```

You should see `op-db`, `op-kv`, and `op-ch` all listed as running.

## 4. Run database migrations

This creates the Postgres tables OpenPanel needs:

```bash
pnpm migrate
```

ClickHouse migrations run automatically when the API boots.

## 5. Start the apps

In one terminal window, run everything in dev mode:

```bash
pnpm dev
```

This starts:

- **Dashboard** (the UI you'll see) — http://localhost:3000
- **API** (event ingestion) — http://localhost:3333
- **Worker** (background jobs)

Open http://localhost:3000 in your browser and create an account.

## 6. Sanity check

Once you're signed in, you'll have an empty project. To see the fixes I'm
making take effect, you need at least a handful of profiles + events. Two
options:

### Option A — Send a few test events

In the dashboard, create a project and copy the client ID. Then from a
terminal:

```bash
curl -X POST http://localhost:3333/track \
  -H "Content-Type: application/json" \
  -H "openpanel-client-id: <YOUR_CLIENT_ID>" \
  -d '{
    "type": "track",
    "payload": {
      "name": "page_view",
      "properties": {
        "path": "/test",
        "referrer": "https://google.com/search?q=pin+drop"
      }
    }
  }'
```

Repeat a few times with different identified profiles to see the user table.

### Option B — Load a snapshot from your live instance (safer than connecting directly)

Once you can SSH into your self-hosted OpenPanel server, we can dump the
ClickHouse `events`, `profiles`, and `sessions` tables, then load them into
your local instance. Tell me when you have access and I'll write the
exact commands.

## 7. Common issues

- **Port already in use** — something else is running on 3000/3333/5432/6379/8123.
  Stop it or change the port in `.env`.
- **`pnpm dev` errors about missing types** — run `pnpm codegen` once.
- **Want to wipe and start over** — `pnpm dock:down` then delete
  `docker/data/` then `pnpm dock:up && pnpm migrate`.

## 8. Where the fixes I'm making live

- `packages/db/src/services/profile.service.ts` — Postgres/ClickHouse queries
- `packages/trpc/src/routers/profile.ts` — API for the user/power-user tables
- `apps/start/src/components/profiles/` — UI for the user pages
- `apps/start/src/components/overview/overview-metric-card.tsx` — metric tiles
- `apps/start/src/components/ui/key-value-grid.tsx` — key/value grid used in many places

When we want to push fixes to your live self-hosted instance, the workflow is:
build the docker images from this branch, push them somewhere your server can
pull from, then `docker compose pull && docker compose up -d` on the server.

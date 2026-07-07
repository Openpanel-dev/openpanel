# Running Locally (macOS, Docker Desktop)

These are the exact steps used to get `api`, `worker`, and `start` (dashboard)
running from source on a Mac, with infra in Docker. Written after actually
doing it end-to-end, including the gotchas.

## 0. Prerequisites

- Docker Desktop installed and running.
- Node — install **Node 22** specifically. The repo's own self-hosting
  Dockerfile pins `NODE_VERSION=22.20.0` (`apps/start/Dockerfile`). Newer
  Node (e.g. 26) breaks things:
  - `apps/api` crashes on boot (`buffer-equal-constant-time` / `jwa` uses
    `SlowBuffer`, removed in newer Node).
  - `apps/worker`'s build (`tsdown`/rolldown) can panic.

  ```bash
  brew install node@22
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # for api/worker
  ```

- pnpm (matching `packageManager` in root `package.json`):
  ```bash
  npm install -g pnpm@10.6.2
  ```

## 1. Start infra (Postgres, Redis, ClickHouse, Redpanda)

```bash
docker compose up -d
```

This only starts infra containers — it does **not** run the app services
(those run from source via `pnpm`, not Docker, for local dev).

⚠️ **Port conflict**: if you already have a native/Homebrew/Postgres.app
Postgres running on `localhost:5432`, the container's port mapping will
silently lose to it — Prisma will fail with `P1010: User was denied access
on the database (not available)`, and `psql` will connect to the wrong
server entirely. Check first:

```bash
lsof -iTCP:5432 -sTCP:LISTEN -P
```

If something other than `com.docker...` owns 5432, remap the container to
a free port instead of fighting for 5432. Create `docker-compose.override.yml`
(gitignored-friendly, don't commit it):

```yaml
services:
  op-db:
    ports:
      - 5433:5432
```

Then point `.env`'s `DATABASE_URL` at `5433` (see step 2).

## 2. Configure `.env`

```bash
cp .env.example .env
```

Edit `.env`:
- `ENCRYPTION_KEY` — generate with `openssl rand -hex 32` and paste in.
- `DATABASE_URL` — update the port if you remapped Postgres (see step 1),
  e.g. `postgresql://postgres:postgres@localhost:5433/postgres?schema=public`.
- Everything else in `.env.example` is fine for local dev as-is.

## 3. Codegen + migrate

```bash
pnpm install
pnpm codegen   # prisma generate + geo DB download
pnpm migrate   # prisma migrate dev — applies all migrations
```

If `pnpm install` warns about ignored build scripts, that's fine — `codegen`
calls `prisma generate` directly, it doesn't depend on the install-time
postinstall hook.

## 4. Run the app services

The root `pnpm dev` script (`pnpm -r --parallel testing`) only starts
`api`/`worker` — `apps/start` has no `testing` script, so it's silently
skipped. Run all three separately instead, each in its own terminal/background
process, using **Node 22** for api/worker:

```bash
# terminal 1
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
pnpm --filter api run dev

# terminal 2 (worker currently has a known rolldown build panic on some
# machines — not required for testing the dashboard/auth flow)
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
pnpm --filter worker run dev

# terminal 3 — dashboard, default Node is fine here
pnpm --filter start run dev
```

Dashboard: http://localhost:3000
API: http://localhost:3333 (`/healthcheck` should return
`{"status":"ok",...}`)

## 5. Dashboard calling production API instead of localhost

`apps/start` uses `@cloudflare/vite-plugin` in plain `vite dev` mode, which
simulates the Cloudflare Workers runtime. That runtime reads its env vars
from the `vars` block in `apps/start/wrangler.jsonc` — **not** from your
shell/`.env`, and that file has real production values checked in
(`API_URL: "https://api.openpanel.dev"`, etc). This causes CORS errors when
signing up/logging in locally, because requests go to the real production
API instead of your local one.

Fix: Wrangler supports a local override file, `.dev.vars` (gitignored via
the repo's `.env*` ignore pattern — don't commit it), which takes priority
over `wrangler.jsonc`'s `vars` in dev. Create
`apps/start/.dev.vars`:

```
VITE_OP_CLIENT_ID=301c6dc1-424c-4bc3-9886-a8beab09b615
API_URL=http://localhost:3333
DASHBOARD_URL=http://localhost:3000
NODE_ENV=development
APP_VERSION=1.0.0
SELF_HOSTED=1
```

Restart `pnpm --filter start run dev` after adding/changing this file.

Don't try setting `NITRO=1` to switch to the Node-server preset as a
"simpler" fix — it avoids the wrangler.jsonc issue but currently triggers a
different SSR crash (`ReferenceError: require is not defined` from
`lowlight`/`react-syntax-highlighter` under the Nitro/ESM module runner).
The `.dev.vars` approach above is the one that actually works end-to-end.

## Summary of one-time local quirks

| Symptom | Cause | Fix |
|---|---|---|
| API crashes with `SlowBuffer`/`jwa` error | Node too new (26+) | Use Node 22 for `api`/`worker` |
| Worker build panics in rolldown | Rust/rolldown bug, machine-dependent | Not required to test dashboard/auth; skip it |
| Prisma `P1010: User was denied access` | Port 5432 already taken by another local Postgres | Remap container port via `docker-compose.override.yml` + update `DATABASE_URL` |
| Sign up/login hits `api.openpanel.dev`, CORS error | `vite dev`'s Cloudflare Workers preset reads `wrangler.jsonc`'s committed prod `vars`, ignoring `.env` | Add `apps/start/.dev.vars` with local values |

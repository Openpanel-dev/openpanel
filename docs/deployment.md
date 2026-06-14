# Build, Deployment & Infrastructure

OpenPanel is a pnpm monorepo deployed as three containerized services (API, Dashboard, Worker) backed by PostgreSQL, ClickHouse, and Redis. This doc covers local dev via docker-compose, self-hosting via Coolify or docker-compose, and the CI/CD pipeline that builds and deploys images to Azure ACR.

## Key Files

| File/Path | Purpose |
|-----------|---------|
| `docker-compose.yml` | Local dev: infra-only (PostgreSQL, ClickHouse, Redis, Dragonfly). Apps run on host via `pnpm dev`. |
| `self-hosting/docker-compose.template.yml` | Self-hosted prod: apps + infra as containers; basis for `get_latest_images` script. |
| `self-hosting/coolify.yml` | Coolify-ready declarative spec (volumes, env templates, services). |
| `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/start/Dockerfile` | Multi-stage builds (base/build/prod/runner); NODE_VERSION=22.20.0; compile deps. |
| `.github/workflows/docker-build.yml` | CI: runs on push to main; detects changes (api/worker/dashboard); builds+pushes to Azure ACR. |
| `.github/workflows/openpanel-release.yaml` | Release automation: cuts GitHub Release + Slack notification on `#tag` commit. |
| `self-hosting/get_latest_images` | Operator tool: fetches latest GitHub tags, updates docker-compose.yml image versions. |
| `self-hosting/quiz.ts` | Interactive setup: generates .env, Caddyfile from templates; runs on `npm run quiz`. |
| `self-hosting/{setup,start,restart,update,stop,rebuild}` | Operator CLI scripts: install deps, run/stop/update/rebuild containers. |
| `biome.json` | Linter+formatter config. |
| `pnpm-workspace.yaml` | Monorepo structure: `apps/*`, `packages/**`, `tooling/*`, `admin`. |
| `vitest.workspace.ts` | Vitest test projects: `packages/*`, `apps/*`. |

## Local Development via docker-compose

### Setup

```bash
# 1. Install Node v22+ and pnpm@10.6.2
pnpm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env: NITRO=1 required to skip Cloudflare plugin
```

### Running Infra

The root `docker-compose.yml` is **infra-only**—it does not include the OpenPanel apps. Apps run on the host via `pnpm` scripts.

```bash
pnpm dock:up        # Start PostgreSQL, ClickHouse, Redis, Dragonfly
pnpm dock:down      # Stop infra

pnpm codegen        # Generate Prisma client + geo data
pnpm migrate        # Run migrations
pnpm dev            # Start API (port 3333) + Worker (port 9999) in parallel
```

In a separate terminal:
```bash
pnpm --filter start with-env vite dev --port 3000  # Dashboard (Vite dev server)
```

**Ports:**
- Dashboard (Vite): http://localhost:3000
- API (Fastify): http://localhost:3333
- Worker (Express + BullMQ): http://localhost:9999
- ClickHouse (HTTP): http://localhost:8123
- PostgreSQL: http://localhost:5432
- Redis: http://localhost:6379

### Utilities

```bash
pnpm dock:ch        # Open ClickHouse CLI
pnpm dock:redis     # Open Redis CLI
pnpm test           # Run Vitest across packages/apps
pnpm typecheck      # TypeScript check
pnpm lint:fix       # Format & lint all via Biome
```

## Self-Hosting

### Prerequisites

- Docker + Docker Compose (or Coolify)
- Node v20+ (for quiz setup)
- Domain name (for HTTPS via Caddy)

### Via Docker Compose (Manual)

**1. Initial Setup**

```bash
cd self-hosting
bash setup                           # Installs Node + Docker if needed
npm install
npm run quiz                         # Interactive: generates .env, Caddyfile
```

The `quiz` script (self-hosting/quiz.ts) prompts for:
- Domain name (e.g., analytics.example.com)
- Database credentials (PostgreSQL, Redis, ClickHouse)
- Email config (sender, Resend API key)
- Basic auth password for Worker dashboard

Outputs:
- `.env` (sourced by docker-compose)
- `caddy/Caddyfile` (reverse proxy config with bcrypt hashed auth)

**2. Run**

```bash
bash start          # docker compose up -d
bash restart        # docker compose restart (after pulling latest images)
bash stop           # docker compose down
```

**3. Update Images**

The `get_latest_images` script syncs container versions from GitHub releases:

```bash
# View latest tags (worker, api, dashboard)
bash get_latest_images

# Apply tags to docker-compose.yml (requires `jq` and Docker login to docker.openpanel.dev)
bash get_latest_images apply

# List all available tags
bash get_latest_images --list
```

**Note:** Access to docker.openpanel.dev requires supporter status ($20+/month). Free users run the published images on Docker Hub (`lindesvard/openpanel-api`, etc.) pinned in the template.

**4. Rebuild a Service**

```bash
bash rebuild api      # Build + restart api service locally
bash rebuild worker
bash rebuild dashboard
```

### Services in docker-compose.yml

| Service | Image | Port | Role |
|---------|-------|------|------|
| `op-proxy` | caddy:2-alpine | 80, 443 | Reverse proxy; routes /api to op-api, /* to op-dashboard |
| `op-db` | postgres:14-alpine (template) / 16 (coolify) | 5432 | App metadata (Prisma) |
| `op-ch` | clickhouse/clickhouse-server:25.10.2.65 (template) / 24.3.2 (coolify) | 8123 | Analytics events |
| `op-kv` | redis:7.2.5-alpine | 6379 | Cache + queue (groupmq + BullMQ) |
| `op-api` | `lindesvard/openpanel-api:2.0.0` (template) | 3000 | tRPC API; runs migrations on start; requires op-db, op-ch, op-kv healthy |
| `op-dashboard` | `lindesvard/openpanel-dashboard:2.0.0` (template) | 3000 | Vite SSR app; depends on op-api |
| `op-worker` | `lindesvard/openpanel-worker:2.0.0` (template) | 3000 | Event processing (groupmq + BullMQ workers); scales via `OP_WORKER_REPLICAS` |

### Via Coolify

Coolify (open-source PaaS) provides declarative deployment. Use `self-hosting/coolify.yml`:

```bash
# Deploy via Coolify CLI or UI
# Coolify injects SERVICE_* env vars (Postgres password, Redis password, etc.)
# and SERVICE_FQDN_* vars (OPAPI, OPDASHBOARD, OPBULLBOARD) from your config
```

Key Coolify-specific vars in `coolify.yml`:
- `SERVICE_USER_POSTGRES`, `SERVICE_PASSWORD_POSTGRES` → auto-injected
- `SERVICE_PASSWORD_REDIS` → auto-injected
- `SERVICE_FQDN_OPAPI`, `SERVICE_FQDN_OPDASHBOARD`, `SERVICE_FQDN_OPBULLBOARD` → generated by Coolify

## CI/CD Pipeline

### Build & Push (on push to main)

**Trigger:** `.github/workflows/docker-build.yml` runs on push to `main`, detects changed apps.

**Path filter:**
- `api` → API image changed
- `worker` → Worker image changed
- `dashboard` → Dashboard image changed

**Job per component:**
1. Checkout repo
2. Set up Docker Buildx
3. Login to Azure Container Registry (via `AZURE_DASH_REGISTRY_*` secrets)
4. Build (multi-stage: base → build → prod → runner)
5. Push tags: `<registry>/openpanel-{api|worker|dashboard}:<short-sha>` and `:latest`

**Outputs:** Azure ACR images. Not directly used by self-hosters (they use `lindesvard/*` from Docker Hub).

**Note:** This repo forks to Azure ACR; the `self-hosting/docker-compose.template.yml` still references `lindesvard/openpanel-*` from Docker Hub (original upstream). A self-hosted instance of *this* fork would need to update the compose template to pull from your ACR instead.

### Test Build (on push to non-main branches)

**Trigger:** `.github/workflows/test-build.yml` runs on push to any non-main branch.

**Purpose:** Verifies Dockerfile builds without pushing (quick validation before PR merge).

### Release & Changelog (on `#tag` commit)

**Trigger:** `.github/workflows/openpanel-release.yaml` runs on push to main, checks for `#tag` in commit message.

**Job:**
1. Determine new version: date-based (YY.MM.DD), with suffix if multiple releases same day (YY.MM.DD.01, .02, etc.)
2. Filter commits since last `#tag` commit
3. Create GitHub Release with changelog
4. Notify Slack (release notes + commit links)

**Note:** This is **release tagging**, not deployment. Does not auto-deploy to dev/prod; that is external infra (not in `.github/`).

### Deploy Convention

Per SETUP.md:

```
Merge to main     → Docker image builds (only changed apps) + auto-deploy to dev
Merge + #d2p-openpanel → Also deploy to prod
```

**Implementation:**
- Image builds: done by `docker-build.yml` (pushes to Azure ACR)
- Auto-deploy to dev: **not in .github/** (external infra, e.g., ArgoCD watching ACR)
- Deploy to prod on `#d2p-openpanel`: **not in .github/** (likely webhook/external CD)

## Docker Image Build Flow

All three apps use multi-stage builds to minimize runtime image size.

### Stage Breakdown (exemplified by api/Dockerfile)

1. **base** — Node 22.20.0 slim, corepack enabled, build tools
2. **build** — Copy workspace + package.json files, run `pnpm install && pnpm codegen && pnpm build`
3. **prod** — Copy pnpm-lock.yaml from build, install prod deps only
4. **runner** — Copy only built artifacts + prod node_modules, set WORKDIR, expose port, run app

**Key points:**
- `DATABASE_URL` passed as build arg
- `pnpm store prune` after install to reduce layer size
- `.dockerignore` excludes `.env`, `node_modules`, `dist`, `.git`, `docker/` dir

### Environment Variables in Containers

**API & Worker:**
- `NODE_ENV=production` (API only — set in apps/api/Dockerfile:87; the Worker Dockerfile does not set it)
- `DATABASE_URL`, `REDIS_URL`, `CLICKHOUSE_URL` (from .env)
- `SELF_HOSTED=true` (if applicable)

**Dashboard (start):**
- `NODE_ENV=production`
- `SELF_HOSTED=true` (if applicable)
- `VITE_SELF_HOSTED=true` (frontend flag)

**Build-time only:**
- `NITRO=1` (start app build switch) — hard-coded as `ENV NITRO=1` in apps/start/Dockerfile:17 and checked in apps/start/vite.config.ts:19. When set, the Vite config uses the Nitro V2 plugin (`node-server` preset); otherwise it falls back to the Cloudflare plugin.

## Datastores

### PostgreSQL

- **Local dev:** postgres:14-alpine (docker-compose.yml)
- **Self-hosted template:** postgres:14-alpine
- **Coolify:** postgres:16-alpine
- **Role:** App metadata (users, projects, orgs, etc.) via Prisma ORM

**Migrations:**
```bash
pnpm migrate          # Dev: run pending migrations
pnpm migrate:deploy   # Prod: deploy (runs in api container on startup via sh -c command)
```

### ClickHouse

- **Local dev:** clickhouse/clickhouse-server:25.10.2.65 (docker-compose.yml)
- **Self-hosted template:** clickhouse/clickhouse-server:25.10.2.65
- **Coolify:** clickhouse/clickhouse-server:24.3.2-alpine
- **Role:** Analytics events (events table, fast OLAP queries)

**Init:** `init-db.sh` creates `openpanel` database on first run.

**Config:** `docker/clickhouse/*.xml`:
- `clickhouse-config.xml`: logger, keep_alive, cluster macros, listen address
- `clickhouse-user-config.xml`: disable query logging (too verbose)

**Gotcha:** ClickHouse 25.10+ requires `CLICKHOUSE_SETTINGS_REMOVE_CONVERT_ANY_JOIN=true` in .env or it rejects certain joins (.cursorrules enforces custom query builder at `packages/db/src/clickhouse/query-builder.ts`).

### Redis

- **Local dev:** redis:7.2.5-alpine (docker-compose.yml)
- **Self-hosted template:** redis:7.2.5-alpine
- **Coolify:** redis:7.4-alpine
- **Role:** Cache + queue (groupmq + BullMQ-style workers in apps/worker)

**Config:** `--maxmemory-policy noeviction` (keep all data; don't evict on full)

## Queue & Workers

**Framework:** [groupmq](https://github.com/groupmq/groupmq) v1.1.1-next.2 (pnpm-workspace.yaml) + BullMQ-style integration.

**Worker app** (`apps/worker/`, port 9999 in dev):
- Imports from `@openpanel/queue` (package that wraps groupmq)
- Processes jobs: email, event ingestion, imports, integrations
- Bull Board UI at `/bull` (requires basic auth in prod via Caddy)
- Scalable: `OP_WORKER_REPLICAS` env var in docker-compose.yml controls replicas

## Linting & Testing

### Biome (biome.json)

Single formatter + linter for TS, TSX, JSON.

```bash
pnpm format           # Check formatting
pnpm format:fix       # Fix formatting
pnpm lint             # Check lint rules
pnpm lint:fix         # Fix lint violations
pnpm lint:workspace   # Check monorepo package dependencies (sherif)
```

**Ignored paths:** `node_modules`, `.next`, `dist`, `coverage`, `*.css`

### Vitest (vitest.workspace.ts)

Test runner for `packages/*` and `apps/*`.

```bash
pnpm test             # Run all tests once (vitest run)
pnpm -r test          # Run per-package tests
```

### TypeScript

```bash
pnpm typecheck        # pnpm -r typecheck (ts --noEmit per app)
```

### Pre-push Hook

`simple-git-hooks` config in root `package.json`:
```json
"pre-push": "[ -n "$SKIP_HOOKS" ] || (pnpm typecheck && pnpm test)"
```

Enforces typecheck + tests before push. Override with `SKIP_HOOKS=1 git push`.

## How It Connects

- **Apps depend on packages:** api/worker/start each import from `@openpanel/db`, `@openpanel/queue`, `@openpanel/redis`, `@openpanel/logger`, etc.
- **Datastores:** PostgreSQL (Prisma) ↔ apps for metadata; ClickHouse for events; Redis for cache/queue
- **Queue:** Apps enqueue jobs via `@openpanel/queue` (groupmq wrapper); Worker processes them
- **CI/CD:** push to main → docker-build.yml builds images → push to Azure ACR; external infra deploys
- **Local dev:** docker-compose infra + host-based app scripts (`pnpm dev` + `pnpm --filter start vite dev`)

## Gotchas

1. **Image registry mismatch:** This fork pushes to Azure ACR (docker-build.yml), but self-hosting templates reference `lindesvard/*` on Docker Hub. If self-hosting *this* fork, update compose template image URLs to your ACR.

2. **NITRO=1 required locally:** Without it, Vite tries to load Cloudflare plugin in local dev (fails). See apps/start/vite.config.ts:19.

3. **ClickHouse 25.10+ requires setting:** Add `CLICKHOUSE_SETTINGS_REMOVE_CONVERT_ANY_JOIN=true` to .env or ClickHouse rejects certain SQL joins. (.cursorrules enforces using the custom query builder to mitigate.)

4. **Dragonfly vs Redis:** Local docker-compose includes Dragonfly (op-df, port 6380) for distributed cache testing, alongside Redis. Apps only use Redis (6379); Dragonfly is optional.

5. **Caddy reverse proxy in self-hosting:** Listens on 80/443; routes /api/* to api:3000, /* to dashboard:3000. Requires valid domain for HTTPS cert (self-signed "tls internal" for localhost:443).

6. **Worker health checks timeout:** Worker starts with 10s health check interval; if slow to boot, may report unhealthy. Increase `retries` in docker-compose.yml if needed.

7. **Database migrations on API start:** Docker-compose api service runs `CI=true pnpm -r run migrate:deploy` before `pnpm start`. This can slow startup; watch logs via `docker compose logs op-api`.

8. **Coolify vs docker-compose:** Coolify's coolify.yml uses service templates + env vars. Postgres version differs (16 vs 14), as does ClickHouse (24.3.2 vs 25.10.2). Test images before deploying.

## Unverified / TODO

1. **Deploy to dev auto-deploy:** SETUP.md says merge to main auto-deploys to dev, but `.github/` has no deploy job. Likely handled by external CD system (ArgoCD, Coolify webhook, etc.). Exact mechanism not in repo.

2. **Deploy to prod on #d2p-openpanel:** No webhook/deploy trigger for this convention in `.github/`. External infra must monitor commit messages.

3. **tooling/publish/publish.ts:** Appears to be SDK release automation (semver bump, npm publish). Not fully explored—assumes it publishes `packages/sdks/*` packages to npm.

4. **BullMQ version:** Package.json lists `bullmq: ^5.63.0`, but `@openpanel/queue` wraps groupmq. Exact interaction untested.

5. **Sentry integration:** vite.config.ts references `VITE_SENTRY_*` env vars. Self-hosting support unclear.

6. **Supporter docker.openpanel.dev registry:** get_latest_images mentions supporter-only access. Terms/features of `docker.openpanel.dev` not documented here.

# API: Event Ingestion & tRPC Backend

The OpenPanel API (`apps/api`) is a **Fastify v5 HTTP server** that serves two distinct purposes:
1. **Public Event Ingestion API** — accepts track/event data from SDKs, validates, and queues them for processing
2. **Private Dashboard API** — exposes tRPC routes for the dashboard UI, handles authentication, and serves real-time data via WebSockets

The server listens on `API_PORT`, which defaults to **3000** in code (apps/api/src/index.ts:65); the repo `.env.example` overrides this to **3333**, so local dev runs on 3333. Both APIs use the same Fastify instance but are segregated via route prefixes and CORS policies.

## Key Files

| File/Path | Purpose |
|-----------|---------|
| `src/index.ts` | Server bootstrap, route registration, middleware setup, error handling |
| `src/routes/*.router.ts` | 11 route modules (track, event, live, ai, webhook, export, import, oauth, profile, insights, misc); tRPC is registered separately via `fastifyTRPCPlugin`, not a `*.router.ts` file |
| `src/controllers/*.controller.ts` | HTTP handlers for public routes; dashboard logic uses tRPC routers |
| `src/hooks/*.hook.ts` | Request middleware: client validation, bot detection, request ID, IP resolution, duplicate filtering, timestamps |
| `src/bots/index.ts` | Pre-compiled bot detection (regex + string-matching) with LRU cache |
| `src/utils/auth.ts` | SDK request validation (client ID/secret, CORS, filters); separate export/import auth |
| `src/utils/rate-limiter.ts` | Redis-backed rate limiting per client ID or IP; configurable per route |
| `src/utils/ai.ts` | Chat model selection (gpt-4o, claude-3-5, gpt-4.1-mini); system prompts for analytics AI |
| `src/utils/ai-tools.ts` | AI tool definitions (getReport, getConversionReport, etc.) for agentic chat |

## Architecture Overview

### Routing Structure

**Public API** (open to SDKs, no session cookie required):
- `/track` – deprecated v2 event tracking endpoint with types (track, identify, increment, decrement, replay); the `alias` type is **not** supported and returns HTTP 400 `Alias is not supported` (apps/api/src/controllers/track.controller.ts:233–239)
- `/event` – v3 unified event endpoint (preferred)
- `/profile` – profile/user data endpoints
- `/export` – export events (requires client secret)
- `/import` – bulk import events (requires client secret)
- `/insights` – aggregated insights endpoints
- `/metrics` – Prometheus metrics (fastify-metrics)
- `/healthz/*` – Kubernetes health probes (live, ready)

**Dashboard/Private API** (requires session cookie; CORS locked to dashboard domain):
- `/trpc/*` – tRPC endpoint for all dashboard queries/mutations (mounted via `fastifyTRPCPlugin`)
- `/live/*` – WebSocket endpoints for real-time event/visitor streams
- `/webhook` – third-party integrations (Stripe, etc.)
- `/oauth` – OAuth callback handlers
- `/misc` – favicon, OG image, geo lookup
- `/ai` – agentic analytics chat (rate-limited)

### Request Flow: Event Ingestion (Track/Event)

```
HTTP POST /track or /event
    ↓
requestIdHook → requestLoggingHook → timestampHook → ipHook
    ↓
clientHook (validates SDK request: client ID, secret, CORS, project filters)
    ↓
isBotHook (detects bot UA, logs to DB, returns 202 if bot)
    ↓
duplicateHook (optional; checks for duplicate events within 5s window)
    ↓
track.controller.handler (deprecated) or event.controller.postEvent (v3)
    ├─ Resolves device ID (from IP + UA + salt, supports override via __deviceId)
    ├─ Derives geographic location (IP → ClickHouse GeoIP)
    ├─ Enqueues event to groupmq: getEventsGroupQueueShard(groupId).add()
    │  (events are ordered by timestamp, grouped by device/profile for order preservation)
    └─ Returns 202 Accepted or 200 OK
    ↓
Queue job → Worker (apps/worker) → ClickHouse + PostgreSQL
```

**Key validation points:**
- Client ID must be valid UUID v4 (apps/api/src/utils/auth.ts:71)
- Client must exist and have an associated project (cached lookup via `getClientByIdCached`)
- IP and profile ID filters applied (blocks requests from blacklisted IPs/profiles)
- Revenue tracking requires client secret unless `allowUnsafeRevenueTracking` enabled
- CORS: checks origin against project's allowed domains (supports wildcards `*.example.com`)

**Special handling:**
- **Device ID**: Generated deterministically from `hash(salt + origin + ip + ua)` using current/previous salts; allows device ID rotation without losing session continuity (apps/api/src/controllers/track.controller.ts:165–183)
- **Timestamps**: Client-supplied `__timestamp` is used as-is unless it is invalid or more than 1 min in the future, in which case the server timestamp is substituted; client timestamps older than 15 min are still used but flagged with `isTimestampFromThePast` (apps/api/src/controllers/track.controller.ts:82–119)
- **Identify**: Updates the user profile in PostgreSQL via `upsertProfile()`, enriching it with geo + user-agent data (apps/api/src/controllers/track.controller.ts:392–425)
- **Increment/Decrement**: Fetch the profile, update only the numeric property (`upsertProfile()`), and do **not** enrich with geo/UA data (apps/api/src/controllers/track.controller.ts:427–511)
- **Alias**: Not supported; returns HTTP 400 `Alias is not supported` (apps/api/src/controllers/track.controller.ts:233–239)
- **Replay**: Session-based session/recording uploads; resolves server-side session ID from IP+UA if client-provided ID stale (apps/api/src/controllers/track.controller.ts:329–390)

### Event Controller (v3 Unified Endpoint)

`apps/api/src/controllers/event.controller.ts:postEvent()` is the newer, simpler event handler:
- Expects `PostEventPayload` (single event, not wrapped in `type`/`payload`)
- Same device ID and geo resolution
- Events queued to groupmq with order preservation
- Returns 202 Accepted

### Bot Detection

Located in `apps/api/src/bots/`:
- **bots.ts**: Auto-generated list of bot patterns (regenerate with `pnpm gen:bots`)
- **index.ts**: Optimized bot matching with LRU cache (1000 entries, 5-min TTL)
  - Fast: string-matching (`.includes()`) checked first
  - Slow: pre-compiled regex patterns tested second
- **is-bot.hook.ts**: Middleware that logs detected bots to PostgreSQL (`createBotEvent()`) and returns 202 if bot detected

### Hooks (Request Middleware)

1. **requestIdHook** – generates/extracts request ID from headers or generates random ID for tracing
2. **timestampHook** – records server-side timestamp on `req.timestamp`
3. **ipHook** – resolves client IP from headers (respects `X-Forwarded-For`, `X-Real-IP` order defined in `@openpanel/common`)
4. **clientHook** – validates SDK request (auth, CORS), attaches `req.client` with project info
5. **isBotHook** – bot detection; logs bots, returns 202 if detected
6. **duplicateHook** – optional; checks Redis for recent identical events (currently commented out in routes)
7. **requestLoggingHook** – logs all requests (except health checks) with elapsed time and input

### Authentication & Authorization

**Public API (SDK):**
- Client ID + optional client secret in headers: `openpanel-client-id`, `openpanel-client-secret`
- Fallback headers for backwards compatibility: `mixan-client-id`, `mixan-client-secret`
- Validation in `apps/api/src/utils/auth.ts:validateSdkRequest()`:
  - Client ID must be valid UUID
  - Client must exist in DB (cached)
  - CORS allowed if origin matches project's allowed domains or secret matches
  - IP/profile ID filters enforced
  - Revenue tracking requires secret or project flag

**Dashboard API (tRPC):**
- Session cookie (`session`) validated in `index.ts:144–157`
- Cookie decoded and session validated via `validateSessionToken()` (from `@openpanel/auth`)
- Attached to `req.session` (empty session if no/invalid cookie)
- tRPC context created in `packages/trpc/src/trpc.ts:createContext()` — passes session + cookie setter to resolvers

**Export/Import (Separate Validators):**
- Both require client secret (no CORS bypass)
- Export: read-only client type enforced
- Import: write-only client type enforced

### Rate Limiting

Configured per-route via `activateRateLimiter()` utility (apps/api/src/utils/rate-limiter.ts):
- Redis-backed, using `@fastify/rate-limit` plugin
- Key: client ID (openpanel-client-id header) or fallback to IP
- Examples:
  - AI chat: 20 req/5min in prod, 100 in dev (apps/api/src/routes/ai.router.ts:6–19)
  - Export: 100 req/10sec (apps/api/src/routes/export.router.ts:8–12)

### WebSockets (Live Routes)

`apps/api/src/routes/live.router.ts` + `apps/api/src/controllers/live.controller.ts`:
- Four WebSocket endpoints:
  - `/live/organization/:organizationId` – org-level event stream
  - `/live/visitors/:projectId` – active visitor count (fire-and-forget)
  - `/live/events/:projectId` – real-time event feed (requires auth)
  - `/live/notifications/:projectId` – project notifications
- Uses Redis pub/sub (`subscribeToPublishedEvent()` from `@openpanel/redis`)
- Back-pressure handling: drops slow clients if buffered bytes > 1MB (prevents heap leaks) (apps/api/src/controllers/live.controller.ts:27)
- Access control: verifies user has project access before subscribing

### AI Analytics Chat

`apps/api/src/routes/ai.router.ts` + `apps/api/src/controllers/ai.controller.ts`:
- **Endpoint**: `POST /ai/chat?projectId=<id>` with `messages` (Message[] from Vercel AI SDK)
- **Rate limit**: 20 req/5min per project in prod
- **Auth**: Requires valid session (dashboard user)
- **Model selection**: Configurable via `AI_MODEL` env var (defaults to gpt-4.1-mini; supports gpt-4o, claude-3-5)
- **AI Tools** (agentic): getReport, getConversionReport, getFunnelReport, getProfile, getProfiles, getAllEventNames (apps/api/src/utils/ai-tools.ts)
- **Streaming**: Uses `streamText()` from Vercel AI SDK with max 2 steps

### tRPC Integration

Mounted at `/trpc/*` via `fastifyTRPCPlugin` (apps/api/src/index.ts:160–181):
- **Router**: `appRouter` from `@openpanel/trpc` (defined in packages/trpc/src/root.ts)
- **Context**: Created by `packages/trpc/src/trpc.ts:createContext()` — includes session, cookie setter, req/res
- **Error handling**: Custom error formatter logs errors except for org.list UNAUTHORIZED
- **Transformer**: superjson (handles Date, Map, Set serialization)
- **Rate limiting**: Can apply middleware to specific procedures; defaults in packages/trpc

The dashboard (`apps/start`) calls tRPC endpoints via `@trpc/client` to fetch data, manage projects, etc.

### Other Routes

- **Profile** (`/profile/*`): User profile endpoints (similar structure to track)
- **Export** (`/export/*`): Event/chart export (requires read client secret)
- **Import** (`/import/*`): Bulk event import (requires write client secret)
- **Insights** (`/insights/*`): Analytics summary endpoints
- **Webhook** (`/webhook/*`): Third-party webhook handlers (Stripe, etc.)
- **OAuth** (`/oauth/*`): OAuth callback handlers
- **Misc** (`/misc/*`): Ping, stats, favicon, OG image generation, geo lookup

## How It Connects

- **Queue**: Events posted to `/track` or `/event` are enqueued via `groupmq` (packages/queue) → Worker picks them up and writes to ClickHouse/PostgreSQL
- **Database**: 
  - Reads: client lookup (cached), project filters, geo data (IP-based), session validation
  - Writes: bot events, profile updates, event queue
- **Redis**: Session/cookie storage, rate limit counters, live event pub/sub, bot detection LRU cache
- **Dashboard**: tRPC calls from `apps/start` hit `/trpc/*`; receives real-time data via `/live/*` WebSockets
- **AI Chat**: Uses AI SDK to call OpenAI/Anthropic; tools invoke database queries to fetch analytics data

## Gotchas

1. **Device ID Salt Rotation**: Device IDs hash with `current` or `previous` salt. When salt rotates, the same device gets a new ID. The API checks both and returns the existing session if found; SDK caches device ID but may receive a different one on session rotation. (apps/api/src/controllers/track.controller.ts:346–371)

2. **Timestamp Validation**: A client timestamp more than 1 min in the future (or invalid) is discarded in favor of the server timestamp; a client timestamp older than 15 min is kept but marked `isTimestampFromThePast` for later filtering. (Note: a stale code comment at line 111 says "1 hour", but the code uses a 15-minute window.) (apps/api/src/controllers/track.controller.ts:99–113)

3. **Bot Events Logged But Not Queued**: When `isBotHook` detects a bot, it logs to `BotEvent` table and returns 202 (success); the event does **not** enter the queue. (apps/api/src/hooks/is-bot.hook.ts:49)

4. **Revenue Tracking Security**: Revenue is only allowed if the request includes a client secret OR the project has `allowUnsafeRevenueTracking` enabled. CORS-only requests cannot send revenue. (apps/api/src/utils/auth.ts:114–122)

5. **Group Queue Ordering**: Events within a group (device ID or profile ID for server events) are ordered by `orderMs` (timestamp). Out-of-order arrivals may cause session breaks. (apps/api/src/controllers/track.controller.ts:309)

6. **WebSocket Back-pressure**: If a client accumulates > 1MB of buffered WebSocket frames, new messages are dropped instead of queued. High-volume subscriptions can cause message loss. (apps/api/src/controllers/live.controller.ts:27)

7. **Private Routes CORS**: tRPC, live, webhook, oauth, misc, ai are all CORS-restricted to the dashboard domain. CORS_ORIGINS env var adds extra domains. (apps/api/src/index.ts:87–114)

8. **Duplicate Hook Disabled**: Code to detect/drop duplicate events is commented out in both route definitions. Duplicates are currently allowed. (apps/api/src/routes/track.router.ts:9, event.router.ts:9)

## Unverified / TODO

- **Replay Buffer Details**: Session/recording replay buffering logic in `replayBuffer.add()` not fully traced (assumes @openpanel/db handles it)
- **Export/Import Bulk Processing**: Exact row limits and error handling for bulk imports unclear
- **Error Handling Gaps**: Generic 500 errors in production omit details; some db calls (increment, decrement) throw unhandled errors
- **AI Tool Limitations**: Tool execution stubs comment out actual data fetching; real implementation status unknown
- **Metrics Endpoint**: Fastify-metrics provides `/metrics`; scrape format/retention unverified

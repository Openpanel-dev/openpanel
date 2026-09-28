// The three URL surfaces `app.ts` hangs CORS, OpenAPI and guards on. Each is
// a factory over `AppDeps`, statically composed from `.use`d modules — no
// filesystem discovery. Adding a module's HTTP half is one `.use` on the
// surface it belongs to; most modules touch exactly one.

import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import type { AppDeps } from './context';
import { createDebugRoutes } from './http/debug.routes';
import { httpMetrics } from './http/http.metrics';
import { httpRateLimit } from './http/rate-limit';
import { queues } from './jobs.registry';
import { registry } from './metrics';
import { assistantRoutes } from './modules/assistant/assistant.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { clientRoutes } from './modules/client/client.routes';
import { exportRoutes, insightsRoutes } from './modules/export/export.routes';
import { gscRoutes } from './modules/gsc/gsc.routes';
import { healthRoutes } from './modules/health/health.routes';
import { importRoutes } from './modules/import/import.routes';
import { ingestRoutes } from './modules/ingest/ingest.routes';
import { integrationRoutes } from './modules/integration/integration.routes';
import { mcpRoutes } from './modules/mcp/mcp.routes';
import { miscRoutes } from './modules/misc/misc.routes';
import { profileRoutes } from './modules/profile/profile.routes';
import { projectRoutes } from './modules/project/project.routes';
import { realtimeRoutes } from './modules/realtime/realtime.routes';
import { subscriptionRoutes } from './modules/subscription/subscription.routes';
import { toolsRoutes } from './modules/tools/tools.routes';

// Pinned to the @elysiajs/openapi 1.4.15 fallback; 2.0 is not viable here.
// `specPath` is set explicitly rather than taking the plugin's `${path}/json`
// default, because the ops surface's contract is exactly `/openapi.json`.
const OPENAPI_SPEC_PATH = '/openapi.json';
// `/metrics` is prometheus text exposition, not an OpenAPI-describable JSON
// endpoint, so it is excluded from the generated spec.
const OPENAPI_EXCLUDED_PATHS = ['/metrics'];

// How long one collected exposition is served for before it is collected again.
// M29-001a measured a single `registry.metrics` at 70-80 ms of the api's ONLY
// JavaScript thread on an idle process against 0.5-0.8 ms for `/healthz`,
// nearly all of it inside prom-client's heap-space collector, which on Bun is a
// JSC heap walk whose cost grows with the heap; under write load and a >=1 Hz
// scrape that was 21.96 % of the thread and every millisecond of it is a
// millisecond no event can be ingested. 5 s is chosen to sit strictly below the
// shortest scrape interval a Prometheus is sanely configured with, so a real
// scraper still collects fresh on every scrape, while a pathologically frequent
// one pays at most one collection per window.
const METRICS_EXPOSITION_TTL_MS = 5000;

// A factory always takes `deps` even where its body is empty so a module
// addition never changes the signature. Return types are left inferred, as
// `defineRoutes`'s `RouteApp` is: `.use`'d plugins widen Elysia's type
// parameters in a way the bare `Elysia` type cannot express.
//
// Client-authed API surface (`/import`, `/manage/*`, `/profile*`, `/export`,
// `/insights`, `/tools`), not session-authed like dashboardRoutes. `/track` and
// `/track/device-id` are the hot path, on the ingest `clientAuth` tier, and the
// one route surface whose hook ORDER is part of the contract.
export const publicApiRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/public-api-routes' })
    // Mounted on the SURFACE, not per module, so a new /manage or /export
    // route cannot arrive without the limit the docs advertise. The prefix
    // table is in http/rate-limit.ts.
    .use(httpRateLimit(deps))
    .use(ingestRoutes(deps))
    .use(importRoutes(deps))
    .use(projectRoutes(deps))
    .use(clientRoutes(deps))
    .use(profileRoutes(deps))
    .use(exportRoutes(deps))
    .use(insightsRoutes(deps))
    .use(toolsRoutes(deps));

// `/gsc` and `/mcp` are dashboard-scope routes absent from the CORS
// delegator's private-path allowlist (`http/cors.ts`'s `CORS_PRIVATE_PATHS`)
// and so get `origin: '*'` — a quirk to keep, not fix. `/oauth`, `/webhook`
// (integration's Slack callback, subscription's Polar callback), `/live` and
// `/misc` ARE in that allowlist.
export const dashboardRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/dashboard-routes' })
    // For `/mcp`; every other path on this surface is unmatched by the table.
    .use(httpRateLimit(deps))
    .use(gscRoutes(deps))
    .use(assistantRoutes(deps))
    .use(mcpRoutes(deps))
    .use(authRoutes(deps))
    .use(integrationRoutes(deps))
    .use(subscriptionRoutes(deps))
    .use(realtimeRoutes(deps))
    .use(miscRoutes(deps));

// The `/metrics` body, collected at most once per METRICS_EXPOSITION_TTL_MS.
// The endpoint still serves the one core registry's full exposition,
// including the heap metrics; what changes is how often that exposition is
// recomputed. Consequence to know: the scrape-time gauges (buffer, queue,
// session) are as old as the snapshot, i.e. up to the TTL, which is the price
// of not walking the heap on every request.
let metricsExposition: { body: string; expiresAt: number } | null = null;
// Concurrent scrapes share one collection instead of queueing N heap walks
// behind each other on the single thread.
let metricsExpositionInFlight: Promise<string> | null = null;

async function collectMetricsExposition(): Promise<string> {
  const body = await registry.metrics();
  metricsExposition = {
    body,
    expiresAt: Date.now() + METRICS_EXPOSITION_TTL_MS,
  };
  return body;
}

function readMetricsExposition(): Promise<string> {
  const cached = metricsExposition;
  if (cached && Date.now() < cached.expiresAt) {
    return Promise.resolve(cached.body);
  }
  if (!metricsExpositionInFlight) {
    // A failed collection must not be cached, and must reject exactly as
    // `registry.metrics()` throws, so the route needs no separate error path.
    metricsExpositionInFlight = collectMetricsExposition().finally(() => {
      metricsExpositionInFlight = null;
    });
  }
  return metricsExpositionInFlight;
}

// `httpMetrics` is on the ops surface because that is where `/metrics` is
// served and every role mounts it. Its hook is `{ as: 'global' }`, so it
// covers the dashboard and public-API surfaces too once they mount.
//
// healthz/metrics/misc share this ops surface (http/context.ts's
// UNLOGGED_PATH_PREFIXES) — unauthenticated, uncorsed, unlogged. /metrics and
// /openapi.json serve the one core registry's prometheus exposition, and the
// OpenAPI reference built from the same zod schemas the routes validate
// against.
export const opsRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/ops-routes' })
    .use(httpMetrics())
    .use(healthRoutes(deps))
    .use(
      openapi({
        specPath: OPENAPI_SPEC_PATH,
        exclude: { paths: OPENAPI_EXCLUDED_PATHS },
      })
    )
    .get('/metrics', async ({ set }) => {
      set.headers['content-type'] = registry.contentType;
      return await readMetricsExposition();
    });

// The local-only ops surface. It is bound HERE rather than in
// `http/debug.routes.ts` because that file needs the `cron` queue's job list
// and transport may not import a registry; a registry binding a transport to a
// queue is the edge pointing the right way.
export const debugRoutes = createDebugRoutes(queues.cron);

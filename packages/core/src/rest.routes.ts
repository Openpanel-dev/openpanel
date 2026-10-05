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
// `specPath` is explicit because the ops surface's contract is `/openapi.json`.
const OPENAPI_SPEC_PATH = '/openapi.json';
// `/metrics` is prometheus text, not an OpenAPI-describable endpoint.
const OPENAPI_EXCLUDED_PATHS = ['/metrics'];

// One `registry.metrics()` costs 70-80 ms of the api's only JavaScript thread
// (prom-client's heap-space collector walks the JSC heap), which at a >=1 Hz
// scrape starves ingest. 5 s stays below any sane scrape interval, so a real
// scraper still collects fresh while a pathologically frequent one pays at
// most one collection per window.
const METRICS_EXPOSITION_TTL_MS = 5000;

// Client-authed API surface, not session-authed like dashboardRoutes. `/track`
// and `/track/device-id` are the hot path, and the one surface whose hook ORDER
// is part of the contract.
export const publicApiRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/public-api-routes' })
    // On the surface, not per module, so a new route cannot arrive without
    // the limit. The prefix table is in http/rate-limit.ts.
    .use(httpRateLimit(deps))
    .use(ingestRoutes(deps))
    .use(importRoutes(deps))
    .use(projectRoutes(deps))
    .use(clientRoutes(deps))
    .use(profileRoutes(deps))
    .use(exportRoutes(deps))
    .use(insightsRoutes(deps))
    .use(toolsRoutes(deps));

// `/gsc` and `/mcp` are absent from the CORS delegator's private-path allowlist
// (`CORS_PRIVATE_PATHS`) and so get `origin: '*'`: a quirk to keep, not fix.
export const dashboardRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/dashboard-routes' })
    // Only `/mcp` matches the prefix table.
    .use(httpRateLimit(deps))
    .use(gscRoutes(deps))
    .use(assistantRoutes(deps))
    .use(mcpRoutes(deps))
    .use(authRoutes(deps))
    .use(integrationRoutes(deps))
    .use(subscriptionRoutes(deps))
    .use(realtimeRoutes(deps))
    .use(miscRoutes(deps));

// Scrape-time gauges (buffer, queue, session) are as old as the snapshot, up to
// the TTL.
let metricsExposition: { body: string; expiresAt: number } | null = null;
// Concurrent scrapes share one collection.
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
    // A failed collection is not cached and rejects as `registry.metrics()` does.
    metricsExpositionInFlight = collectMetricsExposition().finally(() => {
      metricsExpositionInFlight = null;
    });
  }
  return metricsExpositionInFlight;
}

// `httpMetrics` sits on the ops surface because every role mounts it; its hook
// is `{ as: 'global' }`, so it covers the other surfaces too. The ops surface is
// unauthenticated, uncorsed and unlogged.
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

// Bound here, not in `http/debug.routes.ts`: transport may not import a registry.
export const debugRoutes = createDebugRoutes(queues.cron);

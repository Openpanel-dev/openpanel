// The three URL surfaces `app.ts` hangs CORS, OpenAPI and guards on
// (ADR-007 decision 19). Each is a factory over `AppDeps`, statically
// composed from `.use()`d modules — no filesystem discovery. Adding a
// module's HTTP half is one `.use()` on the surface it belongs to; most
// modules touch exactly one.

import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import type { AppDeps } from './context';
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

// ADR-002/ADR-003 pin: @elysiajs/openapi at the 1.4.15 fallback (2.0 is
// NO-GO per spike 6). `specPath` is set explicitly rather than taking the
// plugin's `${path}/json` default, because the ops surface's contract is
// exactly `/openapi.json`.
const OPENAPI_SPEC_PATH = '/openapi.json';
// `/metrics` is prometheus text exposition, not an OpenAPI-describable JSON
// endpoint (ADR-003: "the transform that hides /metrics from the spec").
const OPENAPI_EXCLUDED_PATHS = ['/metrics'];

// A factory always takes `deps` even where its body is empty so a module
// addition never changes the signature. Return types are left inferred, as
// `defineRoutes`'s `RouteApp` is: `.use()`'d plugins widen Elysia's type
// parameters in a way the bare `Elysia` type cannot express.
//
// import's /import/events is the first module to land here (M5-004);
// project's and client's /manage/* (M6-002) and profile's /profile* (M7-002)
// joined it — client-authed API surface, same as /import, not session-authed
// like dashboardRoutes. export's `/export` + `/insights` (M7-007) joined it
// too — `allow: ['read', 'root']` matches V1's shared `validateExportRequest`.
// None of it is yet reachable: the clientAuth macro's authenticator is a P8
// stub that always returns null (import.routes.ts's header), and main.ts
// does not mount `publicApiRoutes` until a real `AppDeps` exists (P3/P4/P8).
// tools' `/site-checker` + `/ip-lookup` (M7-008) joined it too — unauthenticated
// like V1's, per the module map. ingest's `/track` + `/track/device-id`
// (M8-002) lead the list: the hot path, `clientAuth: { ingest: true }`, and
// the one route surface whose hook ORDER is part of the contract.
export const publicApiRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/public-api-routes' })
    .use(ingestRoutes(deps))
    .use(importRoutes(deps))
    .use(projectRoutes(deps))
    .use(clientRoutes(deps))
    .use(profileRoutes(deps))
    .use(exportRoutes(deps))
    .use(insightsRoutes(deps))
    .use(toolsRoutes(deps));

// gsc's callback was the first module to land here (M5-002); assistant's
// `/ai/agents/*` (M5-005), mcp's `/mcp` (M5-007) and auth's `/oauth/*`
// callbacks (M6-003) joined it. None is reachable in production yet: main.ts
// only mounts `dashboardRoutes` once a real `AppDeps` exists (P3/P4/P8) — see
// each module's own routes.ts header for its named gap. `/gsc` and `/mcp` are
// dashboard-scope routes absent from the CORS delegator's `corsPaths`
// allowlist (ADR-002 rule 4) and get `origin: '*'`; `/oauth` IS in
// `corsPaths` — a quirk to port verbatim when app.ts wires CORS, not
// something to fix here.
// integration's `/webhook/slack` and subscription's `/webhook/polar` (M6-006)
// joined it too — like `/oauth`, `/webhook` IS in the CORS delegator's
// `corsPaths` allowlist (ADR-002 rule 4), unlike `/gsc`/`/mcp`, and both are
// the same shape of unauthenticated third-party-redirected callback as
// `/oauth`'s.
// realtime's `/live/*` websockets (M6-007) joined it too — `/live` IS in
// `corsPaths`, same as `/trpc`/`/webhook`/`/oauth`/`/misc`/`/ai`.
// misc's `/misc/*` (M7-008) joined it too — `/misc` IS in `corsPaths`.
export const dashboardRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/dashboard-routes' })
    .use(gscRoutes(deps))
    .use(assistantRoutes(deps))
    .use(mcpRoutes(deps))
    .use(authRoutes(deps))
    .use(integrationRoutes(deps))
    .use(subscriptionRoutes(deps))
    .use(realtimeRoutes(deps))
    .use(miscRoutes(deps));

// healthz/metrics/misc share V1's ops surface (http/context.ts's
// UNLOGGED_PATH_PREFIXES) — unauthenticated, uncorsed, unlogged. /metrics and
// /openapi.json are the M3 gate's ops surface: the one core registry's
// prometheus exposition, and the OpenAPI reference built from the same zod
// schemas the routes validate against.
export const opsRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/ops-routes' })
    .use(healthRoutes(deps))
    .use(
      openapi({
        specPath: OPENAPI_SPEC_PATH,
        exclude: { paths: OPENAPI_EXCLUDED_PATHS },
      })
    )
    .get('/metrics', async ({ set }) => {
      set.headers['content-type'] = registry.contentType;
      return await registry.metrics();
    });

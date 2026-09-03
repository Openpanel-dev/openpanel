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
import { gscRoutes } from './modules/gsc/gsc.routes';
import { healthRoutes } from './modules/health/health.routes';
import { importRoutes } from './modules/import/import.routes';
import { mcpRoutes } from './modules/mcp/mcp.routes';

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
// import's /import/events is the first module to land here (M5-004). It is
// not yet reachable: the clientAuth macro's authenticator is a P8 stub that
// always returns null (import.routes.ts's header), and main.ts does not
// mount `publicApiRoutes` until a real `AppDeps` exists (P3/P4/P8).
export const publicApiRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/public-api-routes' }).use(importRoutes(deps));

// gsc's callback was the first module to land here (M5-002); assistant's
// `/ai/agents/*` (M5-005) and mcp's `/mcp` (M5-007) joined it. None is
// reachable in production yet: main.ts only mounts `dashboardRoutes` once a
// real `AppDeps` exists (P3/P4/P8) — see each module's own routes.ts header
// for its named gap. `/gsc` and `/mcp` are dashboard-scope routes absent from
// the CORS delegator's `corsPaths` allowlist (ADR-002 rule 4) — a quirk to
// port verbatim when app.ts wires CORS, not something to fix here.
export const dashboardRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/dashboard-routes' })
    .use(gscRoutes(deps))
    .use(assistantRoutes(deps))
    .use(mcpRoutes(deps));

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

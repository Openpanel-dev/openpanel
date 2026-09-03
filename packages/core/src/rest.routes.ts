// The three URL surfaces `app.ts` hangs CORS, OpenAPI and guards on
// (ADR-007 decision 19). Each is a factory over `AppDeps`, statically
// composed from `.use()`d modules — no filesystem discovery. Adding a
// module's HTTP half is one `.use()` on the surface it belongs to; most
// modules touch exactly one.

import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import type { AppDeps } from './context';
import { registry } from './metrics';
import { gscRoutes } from './modules/gsc/gsc.routes';
import { healthRoutes } from './modules/health/health.routes';

// ADR-002/ADR-003 pin: @elysiajs/openapi at the 1.4.15 fallback (2.0 is
// NO-GO per spike 6). `specPath` is set explicitly rather than taking the
// plugin's `${path}/json` default, because the ops surface's contract is
// exactly `/openapi.json`.
const OPENAPI_SPEC_PATH = '/openapi.json';
// `/metrics` is prometheus text exposition, not an OpenAPI-describable JSON
// endpoint (ADR-003: "the transform that hides /metrics from the spec").
const OPENAPI_EXCLUDED_PATHS = ['/metrics'];

// Both surfaces still take `deps` even where unused so a module addition
// never changes the factory's signature, only its body. Return types are
// left inferred, as `defineRoutes`'s `RouteApp` is: `.use()`'d plugins widen
// Elysia's type parameters in a way the bare `Elysia` type cannot express.
export const publicApiRoutes = (_deps: AppDeps) =>
  new Elysia({ name: 'core/public-api-routes' });

// gsc's callback is the first module to land here (M5-002). It is not yet
// reachable in production: main.ts only mounts `dashboardRoutes` once a real
// `AppDeps` exists (P3/P4/P8) — see gsc.routes.ts's header for the named gap
// that keeps it inert until then.
export const dashboardRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/dashboard-routes' }).use(gscRoutes(deps));

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

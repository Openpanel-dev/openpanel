// The three URL surfaces `app.ts` hangs CORS, OpenAPI and guards on
// (ADR-007 decision 19). Each is a factory over `AppDeps`, statically
// composed from `.use()`d modules — no filesystem discovery. Adding a
// module's HTTP half is one `.use()` on the surface it belongs to; most
// modules touch exactly one.

import { Elysia } from 'elysia';
import type { AppDeps } from './context';
import { healthRoutes } from './modules/health/health.routes';

// No module lands on either surface yet — the 35 modules' HTTP halves land
// with their waves (P5-P8). Both still take `deps` now so a module addition
// never changes the factory's signature, only its body. Return types are
// left inferred, as `defineRoutes`'s `RouteApp` is: `.use()`'d plugins widen
// Elysia's type parameters in a way the bare `Elysia` type cannot express.
export const publicApiRoutes = (_deps: AppDeps) =>
  new Elysia({ name: 'core/public-api-routes' });

export const dashboardRoutes = (_deps: AppDeps) =>
  new Elysia({ name: 'core/dashboard-routes' });

// healthz/metrics/misc share V1's ops surface (http/context.ts's
// UNLOGGED_PATH_PREFIXES) — unauthenticated, uncorsed, unlogged.
export const opsRoutes = (deps: AppDeps) =>
  new Elysia({ name: 'core/ops-routes' }).use(healthRoutes(deps));

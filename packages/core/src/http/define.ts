// A module's plain-HTTP half: a factory over `AppDeps` returning an Elysia
// instance. Deps flow top-down as plain arguments, the same way
// `createXService(deps, services)` does — no decorators at a distance, no
// options bag.
//
// Identity with a name. It fixes the factory signature and guarantees every
// module starts from the auth plugin, which brings `requestContext(deps)` with
// it: `ctx` is typed in handlers and `session` / `clientAuth` are requestable
// without each module re-wiring either.

import type { AppDeps } from '../context';
import { authMacros } from './auth';

export type RouteApp = ReturnType<typeof baseApp>;

export function defineRoutes<const T>(
  setup: (app: RouteApp, deps: AppDeps) => T
): (deps: AppDeps) => T {
  return (deps) => setup(baseApp(deps), deps);
}

function baseApp(deps: AppDeps) {
  return authMacros(deps);
}

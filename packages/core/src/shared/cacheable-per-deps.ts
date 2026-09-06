// `cacheable` for a function that needs the caller's `ServiceDeps`.
//
// M10-005: the three cross-module caches on the runtime path
// (`getEventMetasCached`, `getProfilesCached`, `getProfilePropertyKeysCached`)
// wrap a function that now reaches Postgres/ClickHouse through `deps`. Passing
// `deps` to `cacheable` directly is not an option: it keys on EVERY argument
// through `stringify`, which walks an object's entries recursively — it would
// serialize the whole Prisma client into the Redis key.
//
// `deps` is not cache identity anyway. It is the scope a call runs in (the
// process's clients plus this request's logger); two calls with the same
// arguments are the same call whichever scope makes them. So the cacheable is
// built once per `deps` and remembered in a WeakMap, and the Redis key stays
// byte-identical to what the module-scope `cacheable(fn, ttl)` this replaces
// produced — hence the EXPLICIT `name`, which is what `fn.name` used to
// supply and what an inline arrow would silently drop.
//
// Consequence, stated: `createCtx` builds a fresh deps object per request
// (context.ts's `installLazyServices`), so the L1 LRU inside `cacheable` is
// per scope rather than per process. The L2 Redis cache — the shared one, the
// one that actually saves the query — is unchanged, so a repeat call costs one
// Redis GET where it used to cost none. Boot-scoped callers (the v1-compat
// seam, job handlers) keep a process-lived L1.

import { cacheable } from '@openpanel/redis';
import type { ServiceDeps } from '../services';

type Cacheable<A extends unknown[], R> = ((...args: A) => Promise<R>) & {
  getKey: (...args: A) => string;
  clear: (...args: A) => Promise<number>;
};

export type CacheablePerDeps<A extends unknown[], R> = ((
  deps: ServiceDeps,
  ...args: A
) => Promise<R>) & {
  getKey: (deps: ServiceDeps, ...args: A) => string;
  clear: (deps: ServiceDeps, ...args: A) => Promise<number>;
};

export function cacheablePerDeps<A extends unknown[], R>(
  name: string,
  fn: (deps: ServiceDeps, ...args: A) => Promise<R>,
  expireInSec: number
): CacheablePerDeps<A, R> {
  const byDeps = new WeakMap<ServiceDeps, Cacheable<A, R>>();

  const forDeps = (deps: ServiceDeps): Cacheable<A, R> => {
    const existing = byDeps.get(deps);
    if (existing) {
      return existing;
    }
    const built = cacheable(
      name,
      (...args: A) => fn(deps, ...args),
      expireInSec
    ) as unknown as Cacheable<A, R>;
    byDeps.set(deps, built);
    return built;
  };

  const run = (deps: ServiceDeps, ...args: A): Promise<R> =>
    forDeps(deps)(...args);
  run.getKey = (deps: ServiceDeps, ...args: A): string =>
    forDeps(deps).getKey(...args);
  run.clear = (deps: ServiceDeps, ...args: A): Promise<number> =>
    forDeps(deps).clear(...args);

  return run;
}

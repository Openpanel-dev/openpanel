// `cacheable` for a function that needs the caller's `ServiceDeps`. Passing
// `deps` to `cacheable` directly would key on every argument through
// `stringify`, serializing the whole Prisma client into the Redis key.
//
// `deps` is not cache identity, so the cacheable is built once per `deps` in a
// WeakMap. The explicit `name` is part of the Redis key (an inline arrow has no
// `fn.name`).
//
// `createCtx` builds a fresh deps per request, so the L1 LRU is per scope, not
// per process; the shared L2 Redis cache is unaffected. A cache that must be
// process-lived takes `cacheablePerDb` below.

import { type CacheableOptions, cacheable } from '@openpanel/redis';
import type { ServiceDeps } from './services';

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
  expireInSec: number,
  options?: CacheableOptions
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
      expireInSec,
      options
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

/** What a cache keyed on the Postgres client needs from a scope. */
export type DbScope = Pick<ServiceDeps, 'db'>;

export type CacheablePerDb<A extends unknown[], R> = ((
  deps: DbScope,
  ...args: A
) => Promise<R>) & {
  getKey: (deps: DbScope, ...args: A) => string;
  clear: (deps: DbScope, ...args: A) => Promise<number>;
};

/**
 * `cacheablePerDeps` for a cache that must be PROCESS-lived. Keying on the scope
 * would give every request an empty L1 LRU and split `.clear()` across as many
 * instances. Keying on `deps.db` (one client per process) keeps one instance to
 * read and invalidate.
 *
 * Safe because `fn` can see nothing but `db`: the closure captures the first
 * caller's scope, and nothing else in it could differ between sharers.
 */
export function cacheablePerDb<A extends unknown[], R>(
  name: string,
  fn: (deps: DbScope, ...args: A) => Promise<R>,
  expireInSec: number,
  options?: CacheableOptions
): CacheablePerDb<A, R> {
  const byDb = new WeakMap<DbScope['db'], Cacheable<A, R>>();

  const forDeps = (deps: DbScope): Cacheable<A, R> => {
    const existing = byDb.get(deps.db);
    if (existing) {
      return existing;
    }
    const built = cacheable(
      name,
      (...args: A) => fn(deps, ...args),
      expireInSec,
      options
    ) as unknown as Cacheable<A, R>;
    byDb.set(deps.db, built);
    return built;
  };

  const run = (deps: DbScope, ...args: A): Promise<R> => forDeps(deps)(...args);
  run.getKey = (deps: DbScope, ...args: A): string =>
    forDeps(deps).getKey(...args);
  run.clear = (deps: DbScope, ...args: A): Promise<number> =>
    forDeps(deps).clear(...args);

  return run;
}

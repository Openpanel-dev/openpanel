//
// Reaches Postgres as `deps.db`, no `@openpanel/db` import left. `main.ts`
// passes its own `deps` to `createInitialSalts` at boot; `salt.jobs.ts`'s
// handler passes its `JobCtx` (a `ServiceDeps` by construction) to
// `rotateSalt`.
//
// `getSalts` is a module-scope `cacheablePerDb`, keyed on the Postgres client
// rather than on the scope — its L1 LRU has to survive across calls to be worth
// anything, and `ingest.service.ts`'s `/track` hot path now passes the scope it
// holds instead of reading a boot-scoped singleton through the deleted compat
// seam. `generateNewSalt` clears the same instance.

import { generateSalt } from '@openpanel/shared/server';
import { cacheablePerDb } from '../../cacheable-per-deps';
import type { ServiceDeps, Services } from '../../services';

const SALT_CACHE_NAME = 'op:salt';
const SALT_CACHE_TTL_SECONDS = 60 * 5;
const SALT_HISTORY_SIZE = 2;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const NO_SALT_FOUND_MESSAGE = 'No salt found';
// The very first boot needs `current` and `previous` to already differ, so
// the bootstrap's older salt is backdated a day rather than created at the
// same instant as the newer one.
const INITIAL_PREVIOUS_SALT_BACKDATE_MS = 24 * 60 * 60 * 1000;

export interface Salts {
  current: string;
  previous: string;
}

/** Only Postgres — narrowed so `main.ts`'s `AppDeps` (which never carries
 *  `queues`; that field only exists on the per-request/per-job `Ctx`)
 *  satisfies it with no cast. */
type SaltDeps = Pick<ServiceDeps, 'db'>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The uncached read `getSalts` wraps — also boot's own existence check. */
export async function fetchSalts(deps: SaltDeps): Promise<Salts> {
  const [curr, prev] = await deps.db.salt.findMany({
    orderBy: { createdAt: 'desc' },
    take: SALT_HISTORY_SIZE,
  });

  if (!curr) {
    throw new Error(NO_SALT_FOUND_MESSAGE);
  }

  return { current: curr.salt, previous: prev?.salt ?? curr.salt };
}

/** L1 LRU (60s) + L2 Redis, one instance per Postgres client. No arguments, so
 *  the Redis key stays the single `cachable:op:salt:[]` the in-factory
 *  `cacheable(SALT_CACHE_NAME, () => fetchSalts(deps), ...)` produced. */
export const getSalts = cacheablePerDb(
  SALT_CACHE_NAME,
  fetchSalts,
  SALT_CACHE_TTL_SECONDS
);

/** Boot bootstrap: creates the first two salts the first time this ever runs. */
export async function createInitialSalts(
  deps: SaltDeps,
  retryCount = 0
): Promise<void> {
  try {
    // Uncached: boot has nothing worth reusing a stale answer for.
    await fetchSalts(deps);
  } catch (error) {
    const noSaltYet =
      error instanceof Error && error.message === NO_SALT_FOUND_MESSAGE;

    if (!noSaltYet) {
      if (retryCount >= MAX_RETRIES) {
        throw new Error(`Failed to create salts after ${MAX_RETRIES} attempts`);
      }
      await sleep(BASE_RETRY_DELAY_MS * 2 ** retryCount);
      await createInitialSalts(deps, retryCount + 1);
      return;
    }

    await deps.db.salt.create({
      data: {
        salt: generateSalt(),
        createdAt: new Date(Date.now() - INITIAL_PREVIOUS_SALT_BACKDATE_MS),
      },
    });
    await deps.db.salt.create({ data: { salt: generateSalt() } });
  }
}

export function createSaltService(
  deps: ServiceDeps,
  _services: () => Services
) {
  async function generateNewSalt() {
    const created = await deps.db.$transaction(async (tx) => {
      const existingSalts = await tx.salt.findMany({
        orderBy: { createdAt: 'desc' },
        take: SALT_HISTORY_SIZE,
      });

      const newSalt = await tx.salt.create({ data: { salt: generateSalt() } });

      // Keep the new salt + the previous newest (if any).
      const previousNewest = existingSalts[0];
      const saltsToKeep = previousNewest
        ? [newSalt.salt, previousNewest.salt]
        : [newSalt.salt];

      await tx.salt.deleteMany({ where: { salt: { notIn: saltsToKeep } } });

      return newSalt;
    });

    await getSalts.clear(deps);

    return created;
  }

  /** Daily rotation: the `salt` cron job's body. */
  async function rotateSalt(
    retryCount = 0
  ): ReturnType<typeof generateNewSalt> {
    try {
      return await generateNewSalt();
    } catch (error) {
      if (retryCount >= MAX_RETRIES) {
        throw error;
      }
      await sleep(BASE_RETRY_DELAY_MS * 2 ** retryCount);
      return rotateSalt(retryCount + 1);
    }
  }

  return {
    getSalts: (): Promise<Salts> => getSalts(deps),
    createInitialSalts: (): Promise<void> => createInitialSalts(deps),
    rotateSalt: (): Promise<{ salt: string; createdAt: Date }> => rotateSalt(),
  };
}

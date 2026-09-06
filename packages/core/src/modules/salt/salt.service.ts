// Moved from packages/db/src/services/salt.service.ts +
// apps/worker/src/jobs/cron.salt.ts (M8-004). V1's boot (createInitialSalts)
// and cron dispatch (rotateSalt, exported there as `salt`) stay the LIVE call
// sites (DELEGATE PATTERN); packages/db keeps a re-export shim.
//
// M10-004: reaches Postgres as `deps.db`, no `@openpanel/db` import left.
// `main.ts` passes its own `deps` to `createInitialSalts` at boot;
// `salt.jobs.ts`'s handler passes its `JobCtx` (a `ServiceDeps` by
// construction) to `rotateSalt`.
//
// `getSalts` is built ONCE per `createSaltService(deps)` call — its
// `cacheable(...)` L1 LRU must survive across calls to stay useful. That
// holds for the two places that matter: `ctx.services.salt` (one Ctx per
// request, but nothing hot-path reads it that way yet) and the v1-compat
// singleton (`registered`, built exactly once at boot by
// `setV1CompatServices`) that `ingest.service.ts`'s `/track` hot path reads
// through — see v1-compat.ts's header. `generateNewSalt` clears the SAME
// closure's cache, which is why it lives inside the factory too.

import { cacheable } from '@openpanel/redis';
import type { ServiceDeps } from '../../services';
import { generateSalt } from '../../shared/crypto';

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

/** Only Postgres — narrowed so `main.ts`'s `AppDeps` (which has no `queues`
 *  yet at the point it calls `createInitialSalts`) satisfies it with no
 *  cast. */
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

/** Boot bootstrap: creates the first two salts the first time this ever runs. */
export async function createInitialSalts(
  deps: SaltDeps,
  retryCount = 0
): Promise<void> {
  try {
    // Uncached: boot has nothing worth reusing a stale answer for.
    await fetchSalts(deps);
  } catch (error) {
    if (!(error instanceof Error && error.message === NO_SALT_FOUND_MESSAGE)) {
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

export interface SaltService {
  getSalts(): Promise<Salts>;
  createInitialSalts(): Promise<void>;
  rotateSalt(): Promise<{ salt: string; createdAt: Date }>;
}

export function createSaltService(deps: ServiceDeps): SaltService {
  const getSalts = cacheable(
    SALT_CACHE_NAME,
    () => fetchSalts(deps),
    SALT_CACHE_TTL_SECONDS
  );

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

    await getSalts.clear();

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
    getSalts: () => getSalts(),
    createInitialSalts: () => createInitialSalts(deps),
    rotateSalt: () => rotateSalt(),
  };
}

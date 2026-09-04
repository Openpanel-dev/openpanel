// Moved from packages/db/src/services/salt.service.ts +
// apps/worker/src/jobs/cron.salt.ts (M8-004). V1's boot (createInitialSalts)
// and cron dispatch (rotateSalt, exported there as `salt`) stay the LIVE call
// sites (DELEGATE PATTERN); packages/db keeps a re-export shim.
//
// db access is LAZY (`loadDb` below), narrowed to `@openpanel/db/src/prisma-client`
// — this module is pulled into the eager barrel via ingest.service.ts, which
// resolves salts on every /track call, and a static import of the full
// @openpanel/db barrel here would spawn a pino-pretty transport worker per
// `bun test --isolate` file (see organization.service.ts's header for the
// fuller reasoning).
//
// `getSalts` wraps `fetchSalts` in `cacheable(...)` — called once, eagerly,
// at this module's first evaluation. `createInitialSalts` deliberately calls
// the raw `fetchSalts` rather than `getSalts`: under a bare (non `--isolate`)
// `bun test` run this module's first evaluation can be forced by an unrelated
// earlier test file (anything eagerly reaching ingest.service.ts or the
// jobs registry), which permanently binds `getSalts`'s caching to whatever
// `@openpanel/redis` was at that moment — the same reason
// organization.service.test.ts never exercises its own `cacheable`-wrapped
// exports. `fetchSalts` never touches `@openpanel/redis`, so it stays
// deterministic regardless of evaluation order.

import { cacheable } from '@openpanel/redis';
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

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The uncached read `getSalts` wraps — also boot's own existence check. */
export async function fetchSalts(): Promise<Salts> {
  const db = await loadDb();
  const [curr, prev] = await db.salt.findMany({
    orderBy: { createdAt: 'desc' },
    take: SALT_HISTORY_SIZE,
  });

  if (!curr) {
    throw new Error(NO_SALT_FOUND_MESSAGE);
  }

  return { current: curr.salt, previous: prev?.salt ?? curr.salt };
}

export const getSalts = cacheable(
  SALT_CACHE_NAME,
  fetchSalts,
  SALT_CACHE_TTL_SECONDS
);

/** Boot bootstrap: creates the first two salts the first time this ever runs. */
export async function createInitialSalts(retryCount = 0): Promise<void> {
  try {
    // Uncached: boot has nothing worth reusing a stale answer for.
    await fetchSalts();
  } catch (error) {
    if (!(error instanceof Error && error.message === NO_SALT_FOUND_MESSAGE)) {
      if (retryCount >= MAX_RETRIES) {
        throw new Error(`Failed to create salts after ${MAX_RETRIES} attempts`);
      }
      await sleep(BASE_RETRY_DELAY_MS * 2 ** retryCount);
      await createInitialSalts(retryCount + 1);
      return;
    }

    const db = await loadDb();
    await db.salt.create({
      data: {
        salt: generateSalt(),
        createdAt: new Date(Date.now() - INITIAL_PREVIOUS_SALT_BACKDATE_MS),
      },
    });
    await db.salt.create({ data: { salt: generateSalt() } });
  }
}

async function generateNewSalt() {
  const db = await loadDb();
  const created = await db.$transaction(async (tx) => {
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
export async function rotateSalt(
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

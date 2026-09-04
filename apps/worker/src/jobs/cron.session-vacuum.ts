// Dissolved into @openpanel/core's session module (M7-001): the stale-blob /
// orphan sweep moved to packages/core/src/modules/session/src/session-vacuum.ts.
// This file stays (DELEGATE PATTERN) — it is the `sessionVacuum` case of
// `cron.ts`'s dispatcher.
import { loadSessionRuntime, vacuumStaleSessions } from '@openpanel/core';
import { logger as baseLogger } from '@/utils/logger';

const logger = baseLogger.child({ job: 'session-vacuum' });

export async function sessionVacuumCronJob() {
  await vacuumStaleSessions({ ...(await loadSessionRuntime()), logger });
}

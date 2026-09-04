// Dissolved into @openpanel/core's session module (M7-001): the wall-clock
// deadman scan, per-project lock and orphan handling moved to
// packages/core/src/modules/session/src/session-reaper.ts. This file stays
// (DELEGATE PATTERN) — it is the `sessionReaper` case of `cron.ts`'s
// dispatcher, and enqueues through V1's BullMQ `sessionsQueue`.
import { loadSessionRuntime, reapIdleSessions } from '@openpanel/core';
import { logger as baseLogger } from '@/utils/logger';
import { enqueueSessionEndV2 } from '@/utils/session-handler';

const logger = baseLogger.child({ job: 'session-reaper' });

export async function sessionReaperCronJob() {
  await reapIdleSessions({
    ...(await loadSessionRuntime()),
    logger,
    enqueueSessionEnd: enqueueSessionEndV2,
  });
}

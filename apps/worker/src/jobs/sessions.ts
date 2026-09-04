// Dissolved into @openpanel/core's session module (M7-001): the events-count
// refresh and the 80%/100% usage alerts moved to
// packages/core/src/modules/session/src/usage.ts. This file stays (DELEGATE
// PATTERN) — it is what `boot-workers.ts` hands V1's BullMQ sessions Worker.
import { updateEventsCount } from '@openpanel/core';
import type { SessionsQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { createSessionEnd } from './events.create-session-end';
import { logger } from '@/utils/logger';

export async function sessionsJob(job: Job<SessionsQueuePayload>) {
  const res = await createSessionEnd(job);
  try {
    await updateEventsCount(job.data.payload.projectId);
  } catch (e) {
    logger.error({ err: e }, 'Failed to update events count');
  }
  return res;
}

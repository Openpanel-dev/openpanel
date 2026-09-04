// Dissolved into @openpanel/core's session module (M7-001): the three-case
// live-vs-snapshot logic, the idempotency claim and the funnel-rule check
// moved to packages/core/src/modules/session/src/session-end.ts (and its
// ClickHouse query onto the `sql` tag). This file stays (DELEGATE PATTERN) —
// it adapts V1's BullMQ `{ type, payload, snapshot }` job to core's
// `{ event, snapshot }` and is what `sessions.ts` still calls.
import {
  createSessionEnd as createSessionEndCore,
  loadSessionEndDeps,
  loadSessionRuntime,
} from '@openpanel/core';
import type { EventsQueuePayloadCreateSessionEnd } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger as baseLogger } from '@/utils/logger';

export async function createSessionEnd(
  job: Job<EventsQueuePayloadCreateSessionEnd>
) {
  const { payload, snapshot } = job.data;
  const logger = baseLogger.child({ payload, jobId: job.id });
  const deps = await loadSessionEndDeps(await loadSessionRuntime(), logger);
  return createSessionEndCore({ event: payload, snapshot }, deps);
}

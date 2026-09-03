// Dissolved into @openpanel/core's gsc module (M5-002): the sync/backfill job
// bodies and their status-update bookkeeping moved to
// packages/core/src/modules/gsc/gsc.service.ts. This file stays (DELEGATE
// PATTERN) — it is the BullMQ job body V1's worker registers
// (boot-workers.ts) and the `cron.ts` dispatcher's `gscSync` case, both thin
// wrappers around the core functions.
import {
  listGscConnectionsForSync,
  runGscProjectBackfill,
  runGscProjectSync,
} from '@openpanel/core';
import type { GscQueuePayload } from '@openpanel/queue';
import { gscQueue } from '@openpanel/queue';
import type { Job } from 'bullmq';
import { logger } from '../utils/logger';

export function gscJob(job: Job<GscQueuePayload>) {
  switch (job.data.type) {
    case 'gscProjectSync':
      return runGscProjectSync(job.data.payload.projectId);
    case 'gscProjectBackfill':
      return runGscProjectBackfill(job.data.payload.projectId);
    default:
      throw new Error('Unknown GSC job type');
  }
}

export async function gscSyncAllJob() {
  const connections = await listGscConnectionsForSync();

  logger.info(
    { count: connections.length },
    'GSC nightly sync: enqueuing projects'
  );

  for (const conn of connections) {
    await gscQueue.add('gscProjectSync', {
      type: 'gscProjectSync',
      payload: { projectId: conn.projectId },
    });
  }
}

// Ported from apps/worker/src/jobs/cron.flush-exports.ts + boot-cron.ts's
// `flushExports` schedule (M9-003, the wave that deletes apps/worker).
// ADR-005's acceptance note gives `flushExports` to this module.
//
// `flushExports` is this module's fragment of the ONE `cron` queue's jobs:
// declared here, spread into jobs.registry.ts and into `CRON_SCHEDULES` by
// jobs/schedulers.ts. Scheduler id and cadence are V1's, unchanged.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import type { SchedulerDefinition } from '../../jobs/schedulers';
import { loadFlushExportsDeps, runFlushExportsCron } from './src/flush-exports';

/** Every 1 minute — drains export buffers to S3/GCS. */
const FLUSH_EXPORTS_INTERVAL_MS = 60_000;

/** This module's fragment of the `cron` queue's jobs. */
export const integrationCronJobs = {
  flushExports: defineJob({
    payload: z.null(),
    handler: async ({ ctx }) => {
      const logger = ctx.logger.child({ job: 'flush-exports' });
      await runFlushExportsCron(await loadFlushExportsDeps(logger));
    },
  }),
};

/** This module's fragment of `CRON_SCHEDULES` — id and cadence unchanged. */
export const integrationCronSchedules: readonly SchedulerDefinition[] = [
  { id: 'flushExports', schedule: { every: FLUSH_EXPORTS_INTERVAL_MS } },
];

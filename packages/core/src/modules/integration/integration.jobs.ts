// ADR-005's acceptance note gives `flushExports` to this module; the schedule
// moved onto the job at ADR-021.
//
// `flushExports` is this module's fragment of the ONE `cron` queue's jobs,
// spread into jobs.registry.ts. Scheduler id and cadence are V1's, unchanged.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';
import {
  type ExportClickhouse,
  type ExportDb,
  runFlushExportsCron,
} from './src/flush-exports';

/** Every 1 minute — drains export buffers to S3/GCS. */
const FLUSH_EXPORTS_INTERVAL_MS = 60_000;

/** This module's fragment of the `cron` queue's jobs. */
export const integrationCronJobs = {
  flushExports: defineJob({
    payload: z.null(),
    cron: { every: FLUSH_EXPORTS_INTERVAL_MS },
    handler: async ({ ctx }) => {
      // Lazy: the registry pulls the S3 and GCS SDKs, ~270ms of module
      // evaluation (measured, Bun 1.4.0) that a static edge here would add to
      // jobs.registry.ts's eager graph and so to every core test file.
      const { getServerIntegration } = await import('./src/registry');

      await runFlushExportsCron({
        db: ctx.db as unknown as ExportDb,
        ch: ctx.ch as unknown as ExportClickhouse,
        logger: ctx.logger.child({ job: 'flush-exports' }),
        config: ctx.config,
        createAdapter: (config) =>
          getServerIntegration(config.type).export?.createAdapter(
            config,
            ctx.config
          ),
      });
    },
  }),
};

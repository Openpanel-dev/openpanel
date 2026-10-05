// `import` is this module's own queue and only job: the registry key, Redis
// name and BullMQ job name are all `import`. There is no cron fragment, imports
// are user-triggered.
//
// Core's worker has no live BullMQ job to hand `updateImportStatus` for
// progress, so this handler runs with the no-op default.

import { z } from 'zod';
import { defineJob } from '../../jobs/define';

const importJobPayload = z.object({ importId: z.string() });

/** The `import` queue's own job. */
export const importQueueJobs = {
  import: defineJob({
    payload: importJobPayload,
    handler: async ({ payload, ctx }) => {
      await ctx.services.import.run(payload.importId);
    },
  }),
};

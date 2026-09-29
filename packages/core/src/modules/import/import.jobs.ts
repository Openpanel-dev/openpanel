// `import` is this module's own queue AND its only job — the registry key, the
// Redis name and the BullMQ job name are all `import` (legacyCompat.import
// already discriminates on `{type: 'import', payload}`, jobs/compat.ts). Unlike
// gsc/cohort/insight, this queue has no cron fragment: imports are always
// user-triggered (import.rpc.ts's create/retry).
//
// Core's own worker has no live BullMQ job to hand `updateImportStatus` for
// progress reporting (see import.service.ts's `ImportJobProgress` header), so
// this handler runs with the no-op default — inert until the worker cutover,
// same as gsc/cohort/insight's job handlers today.

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

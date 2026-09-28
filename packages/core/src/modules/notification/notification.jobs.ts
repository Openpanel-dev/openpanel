// `sendNotification` is this module's own queue (`notification` in the
// registry). legacyCompat.notification already discriminates on this exact
// job name (jobs/compat.ts), so this pins the two in agreement. No cron
// fragment — notifications are always triggered by a rule match, never
// scheduled.

import type { Prisma } from '@openpanel/db/src/prisma-client';
import { z } from 'zod';
import { isProviderError } from '../../clients/provider-error';
import { defineJob } from '../../jobs/define';

// A loose mirror of `Prisma.NotificationUncheckedCreateInput` — the payload
// is a Prisma create input on the wire, and BullMQ stores job data as JSON,
// so this only needs to survive that round-trip, not model every Prisma
// input variant.
const notificationPayload = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  title: z.string(),
  message: z.string(),
  sendToApp: z.boolean().optional(),
  sendToEmail: z.boolean().optional(),
  integrationId: z.string().nullable().optional(),
  notificationRuleId: z.string().nullable().optional(),
  payload: z.unknown().optional(),
});

/** The `notification` queue's own job. */
export const notificationQueueJobs = {
  sendNotification: defineJob({
    payload: z.object({ notification: notificationPayload }),
    handler: async ({ payload, ctx }) => {
      try {
        // `payload.notification` round-tripped through BullMQ's JSON storage
        // and the loose wire schema above — the real shape is Prisma's create
        // input.
        await ctx.services.notification.dispatch(
          payload.notification as Prisma.NotificationUncheckedCreateInput
        );
      } catch (error) {
        // The transport classified this once. A destination that refused the
        // request (4xx) will refuse the identical retry, so it is logged and
        // the job completes; anything retryable is rethrown so the failure is
        // recorded against the job.
        if (isProviderError(error) && !error.retryable) {
          ctx.logger.error(
            {
              err: error,
              provider: error.provider,
              status: error.status,
              integrationId: payload.notification.integrationId,
            },
            'Notification permanently refused by the destination'
          );
          return;
        }
        throw error;
      }
    },
  }),
};

// Dissolved into @openpanel/core's notification module (M6-005): the
// dispatch/delivery body moved to
// packages/core/src/modules/notification/notification.service.ts. This file
// stays (DELEGATE PATTERN) — it is the BullMQ job body V1's worker registers
// (boot-workers.ts), a thin wrapper around the core function.
import { deliverNotification } from '@openpanel/core';
import type { NotificationQueuePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';

export function notificationJob(job: Job<NotificationQueuePayload>) {
  switch (job.data.type) {
    case 'sendNotification':
      return deliverNotification(job.data.payload.notification);
  }
}

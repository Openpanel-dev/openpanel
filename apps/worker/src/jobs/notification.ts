import type { Job } from 'bullmq';

import { Prisma, db } from '@openpanel/db';
import { getServerIntegration } from '@openpanel/integrations/src/registry';
import type { NotificationQueuePayload } from '@openpanel/queue';
import { publishEvent } from '@openpanel/redis';

function isValidJson<T>(
  value: T | Prisma.NullableJsonNullValueInput | null | undefined,
): value is T {
  return (
    value !== null &&
    value !== undefined &&
    value !== Prisma.JsonNull &&
    value !== Prisma.DbNull
  );
}

export async function notificationJob(job: Job<NotificationQueuePayload>) {
  switch (job.data.type) {
    case 'sendNotification': {
      const { notification } = job.data.payload;

      // App + email are pseudo-integrations dispatched by flags, not real rows.
      if (notification.sendToApp) {
        publishEvent('notification', 'created', notification);
        return;
      }

      if (notification.sendToEmail) {
        return;
      }

      if (!notification.integrationId) {
        throw new Error('No integrationId provided');
      }

      const integration = await db.integration.findUniqueOrThrow({
        where: {
          id: notification.integrationId,
        },
      });

      const payload = notification.payload;

      if (!isValidJson(payload)) {
        return new Error('Invalid payload');
      }

      // Generic registry dispatch — no per-type switch. A new notification
      // integration just registers a `notification.deliver` plugin.
      const plugin = getServerIntegration(integration.config.type);
      if (!plugin.notification) {
        throw new Error(
          `Integration ${integration.config.type} is not a notification sink`,
        );
      }

      return plugin.notification.deliver({
        config: integration.config,
        notification: {
          title: notification.title,
          message: notification.message,
        },
        payload,
      });
    }
  }
}

import type { Job } from 'bullmq';

import { db } from '@openpanel/db';
import { sendDiscordNotification } from '@openpanel/integrations/src/discord';
import { sendSlackNotification } from '@openpanel/integrations/src/slack';
import { setSuperJson } from '@openpanel/json';
import type { NotificationQueuePayload } from '@openpanel/queue';
import { getRedisPub, publishEvent } from '@openpanel/redis';

export async function notificationJob(job: Job<NotificationQueuePayload>) {
  switch (job.data.type) {
    case 'sendNotification': {
      const { notification } = job.data.payload;

      if (notification.sendToApp) {
        publishEvent('notification', 'created', notification);
        // empty for now
        return;
      }

      if (notification.sendToEmail) {
        // empty for now
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

      switch (integration.config.type) {
        case 'webhook': {
          return fetch(integration.config.url, {
            method: 'POST',
            headers: {
              ...(integration.config.headers ?? {}),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: notification.title,
              message: notification.message,
            }),
          });
        }
        case 'discord': {
          return sendDiscordNotification({
            webhookUrl: integration.config.url,
            message: [
              `🔔 **${notification.title}**`,
              notification.message,
            ].join('\n'),
          });
        }

        case 'slack': {
          return sendSlackNotification({
            webhookUrl: integration.config.incoming_webhook.url,
            message: [`🔔 *${notification.title}*`, notification.message].join(
              '\n',
            ),
          });
        }
      }
    }
  }
}

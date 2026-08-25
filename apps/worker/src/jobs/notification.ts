import type { Job } from 'bullmq';

import { Prisma, db } from '@openpanel/db';
import { sendDiscordNotification } from '@openpanel/integrations/src/discord';
import { postWebhook } from '@openpanel/integrations/src/fetcher';
import { safeWebhookFetcher } from '@openpanel/integrations/src/safe-fetcher';
import { sendSlackNotification } from '@openpanel/integrations/src/slack';
import { execute as executeJavaScriptTemplate } from '@openpanel/js-runtime';
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

      switch (integration.config.type) {
        case 'webhook': {
          let body: unknown;

          if (integration.config.mode === 'javascript') {
            // We only transform event payloads for now (not funnel)
            if (
              integration.config.javascriptTemplate &&
              payload.type === 'event'
            ) {
              const result = executeJavaScriptTemplate(
                integration.config.javascriptTemplate,
                payload.event,
              );
              body = result;
            } else {
              body = payload;
            }
          } else {
            body = {
              title: notification.title,
              message: notification.message,
            };
          }

          // The webhook URL, its headers and (in javascript mode) its body are
          // all user-controlled, and this runs inside our network. Re-validate
          // the destination on every send rather than trusting it from when it
          // was saved.
          return postWebhook(
            safeWebhookFetcher,
            integration.config.url,
            body,
            integration.config.headers ?? {},
          );
        }
        case 'discord': {
          return sendDiscordNotification({
            fetcher: safeWebhookFetcher,
            webhookUrl: integration.config.url,
            message: [
              `🔔 **${notification.title}**`,
              notification.message,
            ].join('\n'),
          });
        }

        case 'slack': {
          return sendSlackNotification({
            fetcher: safeWebhookFetcher,
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

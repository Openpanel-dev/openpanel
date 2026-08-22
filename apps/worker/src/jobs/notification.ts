import type { Job } from 'bullmq';

import { Prisma, db } from '@openpanel/db';
import { sendEmail } from '@openpanel/email';
import { sendDiscordNotification } from '@openpanel/integrations/src/discord';
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
        const project = await db.project.findUniqueOrThrow({
          where: { id: notification.projectId },
          select: { name: true, organizationId: true },
        });
        const members = await db.member.findMany({
          where: {
            organizationId: project.organizationId,
            user: { deletedAt: null },
          },
          include: { user: { select: { email: true } } },
        });
        const emails = new Set(
          members.flatMap((member) =>
            member.user?.email ? [member.user.email] : [],
          ),
        );
        for (const to of emails) {
          // Per-recipient unsubscribe (product_alerts category) is handled
          // inside sendEmail.
          await sendEmail('notification-rule', {
            to,
            data: {
              title: notification.title,
              message: notification.message,
              projectName: project.name,
              dashboardUrl: `${process.env.DASHBOARD_URL ?? 'https://dashboard.openpanel.dev'}/${project.organizationId}/${notification.projectId}`,
            },
          });
        }
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

          return fetch(integration.config.url, {
            method: 'POST',
            headers: {
              ...(integration.config.headers ?? {}),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
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

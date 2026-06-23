import type { Job } from 'bullmq';

import { Prisma, db } from '@openpanel/db';
import { sendEmail } from '@openpanel/email';
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

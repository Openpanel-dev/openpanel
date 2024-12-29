import { z } from 'zod';

import {
  APP_NOTIFICATION_INTEGRATION_ID,
  BASE_INTEGRATIONS,
  EMAIL_NOTIFICATION_INTEGRATION_ID,
  db,
  getNotificationRulesByProjectId,
  isBaseIntegration,
} from '@openpanel/db';
import { zCreateNotificationRule } from '@openpanel/validation';

import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return db.notification.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          integration: {
            select: {
              name: true,
            },
          },
          notificationRule: {
            select: {
              name: true,
            },
          },
        },
        take: 100,
      });
    }),
  rules: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return db.notificationRule
        .findMany({
          where: {
            projectId: input.projectId,
          },
          include: {
            integrations: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        })
        .then((rules) => {
          return rules.map((rule) => {
            return {
              ...rule,
              integrations: [
                ...BASE_INTEGRATIONS.filter((integration) => {
                  return (
                    (integration.id === APP_NOTIFICATION_INTEGRATION_ID &&
                      rule.sendToApp) ||
                    (integration.id === EMAIL_NOTIFICATION_INTEGRATION_ID &&
                      rule.sendToEmail)
                  );
                }),
                ...rule.integrations,
              ],
            };
          });
        });
    }),
  createOrUpdateRule: protectedProcedure
    .input(zCreateNotificationRule)
    .mutation(async ({ input }) => {
      // Clear the cache for the project
      await getNotificationRulesByProjectId.clear(input.projectId);

      if (input.id) {
        return db.notificationRule.update({
          where: {
            id: input.id,
          },
          data: {
            name: input.name,
            projectId: input.projectId,
            sendToApp: !!input.integrations.find(
              (id) => id === APP_NOTIFICATION_INTEGRATION_ID,
            ),
            sendToEmail: !!input.integrations.find(
              (id) => id === EMAIL_NOTIFICATION_INTEGRATION_ID,
            ),
            integrations: {
              set: input.integrations
                .filter((id) => !isBaseIntegration(id))
                .map((id) => ({ id })),
            },
            config: input.config,
            template: input.template || null,
          },
        });
      }

      return db.notificationRule.create({
        data: {
          name: input.name,
          projectId: input.projectId,
          sendToApp: !!input.integrations.find(
            (id) => id === APP_NOTIFICATION_INTEGRATION_ID,
          ),
          sendToEmail: !!input.integrations.find(
            (id) => id === EMAIL_NOTIFICATION_INTEGRATION_ID,
          ),
          integrations: {
            connect: input.integrations
              .filter((id) => !isBaseIntegration(id))
              .map((id) => ({ id })),
          },
          config: input.config,
        },
      });
    }),
  deleteRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id }, ctx }) => {
      const rule = await db.notificationRule.findUniqueOrThrow({
        where: {
          id,
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: rule.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.notificationRule.delete({
        where: {
          id,
        },
      });
    }),
});

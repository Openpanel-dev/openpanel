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
import { TRPCBadRequestError, TRPCForbiddenError } from '../errors';
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
        take: 5000,
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
    .mutation(async ({ input, ctx }) => {
      // Clear the cache for the project
      await getNotificationRulesByProjectId.clear(input.projectId);

      // Authorize the target project (covers both create and update; the create
      // branch previously had no access check) and verify every connected
      // integration belongs to this project or is a legacy org-wide one in the
      // same org — never another project's.
      const project = await db.project.findUniqueOrThrow({
        where: { id: input.projectId },
        select: { organizationId: true },
      });
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
      });
      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      const integrationIds = input.integrations.filter(
        (id) => !isBaseIntegration(id),
      );
      if (integrationIds.length > 0) {
        const integrations = await db.integration.findMany({
          where: { id: { in: integrationIds } },
          select: { id: true, projectId: true, organizationId: true },
        });
        if (integrations.length !== integrationIds.length) {
          throw new TRPCBadRequestError(
            'One or more integrations were not found',
          );
        }
        for (const integration of integrations) {
          const sameProject = integration.projectId === input.projectId;
          const orgWideSameOrg =
            integration.projectId === null &&
            integration.organizationId === project.organizationId;
          if (!sameProject && !orgWideSameOrg) {
            throw new TRPCForbiddenError(
              'Integration does not belong to this project',
            );
          }
        }
      }

      if (input.id) {
        const existing = await db.notificationRule.findUniqueOrThrow({
          where: {
            id: input.id,
          },
        });

        const access = await getProjectAccess({
          userId: ctx.session.userId,
          projectId: existing.projectId,
        });

        if (!access) {
          throw new TRPCForbiddenError(
            'You do not have access to this project',
          );
        }

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
          template: input.template || null,
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
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return db.notificationRule.delete({
        where: {
          id,
        },
      });
    }),
});

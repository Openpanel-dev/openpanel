import { z } from 'zod';

import { BASE_INTEGRATIONS, db } from '@openpanel/db';

import { getSlackInstallUrl } from '@openpanel/integrations/src/slack';
import {
  type ISlackConfig,
  zCreateDiscordIntegration,
  zCreateSlackIntegration,
  zCreateWebhookIntegration,
} from '@openpanel/validation';
import { getOrganizationAccessCached } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const integrationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const integration = await db.integration.findUniqueOrThrow({
        where: {
          id: input.id,
        },
      });

      const access = await getOrganizationAccessCached({
        userId: ctx.session.userId,
        organizationId: integration.organizationId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return integration;
    }),
  list: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const integrations = await db.integration.findMany({
        where: {
          organizationId: input.organizationId,
        },
      });

      return [...BASE_INTEGRATIONS, ...integrations];
    }),
  createOrUpdateSlack: protectedProcedure
    .input(zCreateSlackIntegration)
    .mutation(async ({ input }) => {
      if (input.id) {
        const res = await db.integration.update({
          where: {
            id: input.id,
            organizationId: input.organizationId,
          },
          data: {
            name: input.name,
            // This is empty and will be filled by the webhook
            config: {} as ISlackConfig,
          },
        });

        return {
          ...res,
          slackInstallUrl: await getSlackInstallUrl({
            integrationId: res.id,
            organizationId: input.organizationId,
            projectId: input.projectId,
          }),
        };
      }

      const res = await db.integration.create({
        data: {
          name: input.name,
          organizationId: input.organizationId,
          // This is empty and will be filled by the webhook
          config: {} as ISlackConfig,
        },
      });

      return {
        ...res,
        slackInstallUrl: await getSlackInstallUrl({
          integrationId: res.id,
          organizationId: input.organizationId,
          projectId: input.projectId,
        }),
      };
    }),
  createOrUpdate: protectedProcedure
    .input(z.union([zCreateDiscordIntegration, zCreateWebhookIntegration]))
    .mutation(async ({ input }) => {
      if (input.id) {
        return db.integration.update({
          where: {
            id: input.id,
            organizationId: input.organizationId,
          },
          data: {
            name: input.name,
            config: input.config,
          },
        });
      }
      return db.integration.create({
        data: {
          name: input.name,
          organizationId: input.organizationId,
          config: input.config,
        },
      });
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id }, ctx }) => {
      const integration = await db.integration.findUniqueOrThrow({
        where: {
          id,
        },
      });

      const access = await getOrganizationAccessCached({
        userId: ctx.session.userId,
        organizationId: integration.organizationId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.integration.delete({
        where: {
          id,
        },
      });
    }),
});

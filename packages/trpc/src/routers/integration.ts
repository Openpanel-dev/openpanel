import { z } from 'zod';

import { BASE_INTEGRATIONS, db } from '@openpanel/db';

import { getServerIntegration } from '@openpanel/integrations/src/registry';
import { getSlackInstallUrl } from '@openpanel/integrations/src/slack';
import {
  type IIntegrationConfig,
  type ISlackConfig,
  zCreateGCSExportIntegration,
  zCreateS3ExportIntegration,
  zCreateSlackIntegration,
  zIntegrationConfig,
} from '@openpanel/validation';
import { getOrganizationAccess, getProjectAccess } from '../access';
import { TRPCForbiddenError, TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

// Assert the user can access the project, and return the project's
// organizationId (still stored on the integration for org-level queries/cascades).
async function assertProjectAccessAndGetOrg(userId: string, projectId: string) {
  const access = await getProjectAccess({ userId, projectId });
  if (!access) {
    throw new TRPCForbiddenError('You do not have access to this project');
  }
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { organizationId: true },
  });
  return project.organizationId;
}

// Shared create/update path for any form-configured integration. All per-type
// behavior (validation, connection test, credential encryption) is delegated to
// the integration's server plugin — adding a new integration needs no change here.
async function upsertIntegration(
  userId: string,
  input: {
    id?: string;
    name: string;
    projectId: string;
    config: IIntegrationConfig;
  },
) {
  // Authorize first. For an update, authorize against the EXISTING integration's
  // scope — not the attacker-controlled input.projectId — so a user with access
  // to one project can't update another project's integration in the same org.
  let organizationId: string;
  if (input.id) {
    const existing = await db.integration.findUniqueOrThrow({
      where: { id: input.id },
      select: { projectId: true, organizationId: true },
    });
    await assertIntegrationAccess(userId, existing);
    organizationId = existing.organizationId;
  } else {
    organizationId = await assertProjectAccessAndGetOrg(userId, input.projectId);
  }

  const plugin = getServerIntegration(input.config.type);

  const validation = plugin.validateConfig?.(input.config);
  if (validation && !validation.valid) {
    throw new TRPCBadRequestError(`Invalid config: ${validation.error}`);
  }

  // Test the connection with the unencrypted credentials before saving.
  const testResult = await plugin.testConnection?.(input.config);
  if (testResult && !testResult.success) {
    throw new TRPCBadRequestError(`Failed to connect: ${testResult.error}`);
  }

  const config = plugin.encryptCredentials?.(input.config) ?? input.config;

  if (input.id) {
    return db.integration.update({
      where: { id: input.id, organizationId },
      data: { name: input.name, config },
    });
  }
  return db.integration.create({
    data: {
      name: input.name,
      organizationId,
      projectId: input.projectId,
      config,
    },
  });
}

// Access check for an existing integration of either scope: project-scoped rows
// check project access; legacy org-wide rows (projectId null) check org access.
async function assertIntegrationAccess(
  userId: string,
  integration: { projectId: string | null; organizationId: string },
) {
  const access = integration.projectId
    ? await getProjectAccess({ userId, projectId: integration.projectId })
    : await getOrganizationAccess({
        userId,
        organizationId: integration.organizationId,
      });
  if (!access) {
    throw new TRPCForbiddenError('You do not have access to this integration');
  }
}

export const integrationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const integration = await db.integration.findUniqueOrThrow({
        where: {
          id: input.id,
        },
      });

      await assertIntegrationAccess(ctx.session.userId, integration);

      return integration;
    }),
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const organizationId = await assertProjectAccessAndGetOrg(
        ctx.session.userId,
        input.projectId,
      );

      const integrations = await db.integration.findMany({
        where: {
          // The project's own integrations, plus legacy org-wide integrations
          // (projectId null) so they stay visible/selectable during the
          // transition off org-scoping.
          OR: [
            { projectId: input.projectId },
            { projectId: null, organizationId },
          ],
          config: {
            not: {},
          },
        },
      });

      return [...BASE_INTEGRATIONS, ...integrations];
    }),
  createOrUpdateSlack: protectedProcedure
    .input(zCreateSlackIntegration)
    .mutation(async ({ input, ctx }) => {
      // For an update, authorize against the existing integration's scope so a
      // user can't clear/re-install another project's Slack integration.
      let organizationId: string;
      if (input.id) {
        const existing = await db.integration.findUniqueOrThrow({
          where: { id: input.id },
          select: { projectId: true, organizationId: true },
        });
        await assertIntegrationAccess(ctx.session.userId, existing);
        organizationId = existing.organizationId;
      } else {
        organizationId = await assertProjectAccessAndGetOrg(
          ctx.session.userId,
          input.projectId,
        );
      }

      const res = input.id
        ? await db.integration.update({
            where: {
              id: input.id,
              organizationId,
            },
            data: {
              name: input.name,
              // This is empty and will be filled by the webhook
              config: {} as ISlackConfig,
            },
          })
        : await db.integration.create({
            data: {
              name: input.name,
              organizationId,
              projectId: input.projectId,
              // This is empty and will be filled by the webhook
              config: {} as ISlackConfig,
            },
          });

      return {
        ...res,
        slackInstallUrl: await getSlackInstallUrl({
          integrationId: res.id,
          organizationId,
          projectId: input.projectId,
        }),
      };
    }),
  // Generic create/update for any form-configured integration. Per-type
  // behavior lives in the server plugin; no switch here.
  createOrUpdate: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      }),
    )
    .mutation(({ input, ctx }) => upsertIntegration(ctx.session.userId, input)),
  // Back-compat alias for the export forms; delegates to the same generic path.
  // TODO: remove once the dashboard calls `createOrUpdate` directly.
  createOrUpdateExport: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) => upsertIntegration(ctx.session.userId, input)),
  // Generic, registry-driven connection test.
  testConnection: protectedProcedure
    .input(z.object({ config: zIntegrationConfig }))
    .mutation(
      async ({ input }) =>
        (await getServerIntegration(input.config.type).testConnection?.(
          input.config,
        )) ?? { success: true },
    ),
  // Back-compat alias for the export forms.
  // TODO: remove once the dashboard calls `testConnection` directly.
  testExportConnection: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(
      async ({ input }) =>
        (await getServerIntegration(input.config.type).testConnection?.(
          input.config,
        )) ?? { success: false, error: 'Unknown export type' },
    ),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id }, ctx }) => {
      const integration = await db.integration.findUniqueOrThrow({
        where: {
          id,
        },
      });

      await assertIntegrationAccess(ctx.session.userId, integration);

      return db.integration.delete({
        where: {
          id,
        },
      });
    }),
});

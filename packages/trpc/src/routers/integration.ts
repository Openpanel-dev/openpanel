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
import {
  getOrganizationAccess,
  requireOrganizationAdmin,
  requireProjectAccess,
} from '../access';
import { TRPCForbiddenError, TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

// Assert the user can act on the project at `level`, and return the project's
// organizationId (still stored on the integration for org-level queries/cascades).
async function assertProjectAccessAndGetOrg(
  userId: string,
  projectId: string,
  level: 'read' | 'write',
) {
  await requireProjectAccess({ userId, projectId, level });

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
    await assertIntegrationAccess(userId, existing, 'write');
    organizationId = existing.organizationId;
  } else {
    organizationId = await assertProjectAccessAndGetOrg(
      userId,
      input.projectId,
      'write',
    );
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

// Access check for an existing integration of either scope. Project-scoped rows
// go through the project ladder; legacy org-wide rows (projectId null) have no
// project access level to consult, so a write to one — it is shared by every
// project in the org — is admin-tier, while a read only needs membership.
async function assertIntegrationAccess(
  userId: string,
  integration: { projectId: string | null; organizationId: string },
  level: 'read' | 'write',
) {
  if (integration.projectId) {
    await requireProjectAccess({
      userId,
      projectId: integration.projectId,
      level,
    });
    return;
  }

  if (level === 'write') {
    await requireOrganizationAdmin({
      userId,
      organizationId: integration.organizationId,
      message: 'Only organization admins can change an org-wide integration',
    });
    return;
  }

  const access = await getOrganizationAccess({
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

      await assertIntegrationAccess(ctx.session.userId, integration, 'read');

      return integration;
    }),
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const organizationId = await assertProjectAccessAndGetOrg(
        ctx.session.userId,
        input.projectId,
        'read',
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
        await assertIntegrationAccess(ctx.session.userId, existing, 'write');
        organizationId = existing.organizationId;
      } else {
        organizationId = await assertProjectAccessAndGetOrg(
          ctx.session.userId,
          input.projectId,
          'write',
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
  // Generic, registry-driven connection test. Gated on project write access:
  // it makes the server connect outbound to a caller-supplied destination with
  // caller-supplied credentials, so it must not be reachable by anyone who
  // merely holds a session.
  testConnection: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      return (
        (await getServerIntegration(input.config.type).testConnection?.(
          input.config,
        )) ?? { success: true }
      );
    }),
  // Back-compat alias for the export forms; same gate as `testConnection`.
  // TODO: remove once the dashboard calls `testConnection` directly.
  testExportConnection: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      return (
        (await getServerIntegration(input.config.type).testConnection?.(
          input.config,
        )) ?? { success: false, error: 'Unknown export type' }
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id }, ctx }) => {
      const integration = await db.integration.findUniqueOrThrow({
        where: {
          id,
        },
      });

      await assertIntegrationAccess(ctx.session.userId, integration, 'write');

      return db.integration.delete({
        where: {
          id,
        },
      });
    }),
});

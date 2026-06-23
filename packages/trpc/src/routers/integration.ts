import { z } from 'zod';

import { BASE_INTEGRATIONS, db } from '@openpanel/db';
import { encryptCredential } from '@openpanel/common/server';

import {
  createS3Adapter,
  createGCSAdapter,
} from '@openpanel/integrations/src/object-store';
import { getSlackInstallUrl } from '@openpanel/integrations/src/slack';
import {
  type ISlackConfig,
  zCreateDiscordIntegration,
  zCreateGCSExportIntegration,
  zCreateS3ExportIntegration,
  zCreateSlackIntegration,
  zCreateWebhookIntegration,
} from '@openpanel/validation';
import { getOrganizationAccess, getProjectAccess } from '../access';
import { TRPCForbiddenError, TRPCBadRequestError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { validate as validateJavaScriptTemplate } from '@openpanel/js-runtime';

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
      const organizationId = await assertProjectAccessAndGetOrg(
        ctx.session.userId,
        input.projectId,
      );

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
  createOrUpdate: protectedProcedure
    .input(z.union([zCreateDiscordIntegration, zCreateWebhookIntegration]))
    .mutation(async ({ input, ctx }) => {
      const organizationId = await assertProjectAccessAndGetOrg(
        ctx.session.userId,
        input.projectId,
      );

      // Validate JavaScript template if mode is javascript
      if (
        input.config.type === 'webhook' &&
        input.config.mode === 'javascript' &&
        input.config.javascriptTemplate
      ) {
        const validation = validateJavaScriptTemplate(
          input.config.javascriptTemplate,
        );
        if (!validation.valid) {
          throw new TRPCBadRequestError(
            `Invalid JavaScript template: ${validation.error}`,
          );
        }
      }

      if (input.id) {
        return db.integration.update({
          where: {
            id: input.id,
            organizationId,
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
          organizationId,
          projectId: input.projectId,
          config: input.config,
        },
      });
    }),
  createOrUpdateExport: protectedProcedure
    .input(
      z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]),
    )
    .mutation(async ({ input, ctx }) => {
      const organizationId = await assertProjectAccessAndGetOrg(
        ctx.session.userId,
        input.projectId,
      );

      // Test connection before saving (using unencrypted credentials)
      if (input.config.type === 's3_export') {
        const adapter = createS3Adapter(input.config);
        const testResult = await adapter.testConnection();
        if (!testResult.success) {
          throw new TRPCBadRequestError(
            `Failed to connect to S3: ${testResult.error}`,
          );
        }
      } else if (input.config.type === 'gcs_export') {
        const adapter = createGCSAdapter(input.config);
        const testResult = await adapter.testConnection();
        if (!testResult.success) {
          throw new TRPCBadRequestError(
            `Failed to connect to GCS: ${testResult.error}`,
          );
        }
      }

      // Encrypt sensitive credentials before storing
      let configToSave = input.config;
      if (input.config.type === 's3_export' && input.config.authMode === 'access_key') {
        configToSave = {
          ...input.config,
          secretAccessKey: encryptCredential(input.config.secretAccessKey),
        };
      } else if (input.config.type === 'gcs_export') {
        configToSave = {
          ...input.config,
          serviceAccountKey: encryptCredential(input.config.serviceAccountKey),
        };
      }

      if (input.id) {
        return db.integration.update({
          where: {
            id: input.id,
            organizationId,
          },
          data: {
            name: input.name,
            config: configToSave,
          },
        });
      }
      return db.integration.create({
        data: {
          name: input.name,
          organizationId,
          projectId: input.projectId,
          config: configToSave,
        },
      });
    }),
  testExportConnection: protectedProcedure
    .input(
      z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]),
    )
    .mutation(async ({ input }) => {
      if (input.config.type === 's3_export') {
        const adapter = createS3Adapter(input.config);
        return adapter.testConnection();
      }
      if (input.config.type === 'gcs_export') {
        const adapter = createGCSAdapter(input.config);
        return adapter.testConnection();
      }
      return { success: false, error: 'Unknown export type' };
    }),
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

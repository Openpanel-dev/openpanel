// `enforceAccess` only sees a top-level `projectId` / `organizationId`, so
// anything resolved from another id needs its own explicit check. Access
// assertions live in integration.service.ts.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import {
  zCreateGCSExportIntegration,
  zCreateS3ExportIntegration,
  zCreateSlackIntegration,
  zIntegrationConfig,
} from './integration.constants';
import {
  createOrUpdateSlackIntegration,
  deleteIntegration,
  getIntegrationById,
  listIntegrationsForProject,
  testExportIntegrationConnection,
  testIntegrationConnection,
  upsertIntegration,
} from './integration.service';

export const integrationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input, ctx }) =>
      getIntegrationById(ctx, ctx.session.userId, input.id)
    ),

  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) =>
      listIntegrationsForProject(ctx, ctx.session.userId, input.projectId)
    ),

  createOrUpdateSlack: protectedProcedure
    .input(zCreateSlackIntegration)
    .mutation(({ input, ctx }) =>
      createOrUpdateSlackIntegration(ctx, ctx.session.userId, input)
    ),

  createOrUpdate: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      })
    )
    .mutation(({ input, ctx }) =>
      upsertIntegration(ctx, ctx.session.userId, input)
    ),

  // Back-compat alias for the export forms; delegates to the same generic path.
  // TODO: remove once the dashboard calls `createOrUpdate` directly.
  createOrUpdateExport: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) =>
      upsertIntegration(ctx, ctx.session.userId, input)
    ),

  testConnection: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      })
    )
    .mutation(({ input, ctx }) =>
      testIntegrationConnection(ctx, ctx.session.userId, input)
    ),

  // Back-compat alias for the export forms; same gate as `testConnection`.
  // TODO: remove once the dashboard calls `testConnection` directly.
  testExportConnection: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) =>
      testExportIntegrationConnection(ctx, ctx.session.userId, input)
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input: { id }, ctx }) =>
      deleteIntegration(ctx, ctx.session.userId, id)
    ),
});

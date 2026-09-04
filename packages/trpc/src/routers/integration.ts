// Dissolved into @openpanel/core's integration module (M6-006): the CRUD,
// Slack OAuth install and connection-test bodies moved to
// packages/core/src/modules/integration/integration.service.ts. This router
// stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack
// (session/access/logger/rate-limit middleware) and delegates every handler
// body to core's integration functions, same as notification's router does
// (M6-005).

import {
  createOrUpdateSlackIntegration,
  deleteIntegration,
  getIntegrationById,
  listIntegrationsForProject,
  testExportIntegrationConnection,
  testIntegrationConnection,
  upsertIntegration,
} from '@openpanel/core';
import {
  zCreateGCSExportIntegration,
  zCreateS3ExportIntegration,
  zCreateSlackIntegration,
  zIntegrationConfig,
} from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const integrationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input, ctx }) =>
      getIntegrationById(ctx.session.userId, input.id)
    ),
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) =>
      listIntegrationsForProject(ctx.session.userId, input.projectId)
    ),
  createOrUpdateSlack: protectedProcedure
    .input(zCreateSlackIntegration)
    .mutation(({ input, ctx }) =>
      createOrUpdateSlackIntegration(ctx.session.userId, input)
    ),
  // Generic create/update for any form-configured integration. Per-type
  // behavior lives in the server plugin; no switch here.
  createOrUpdate: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      })
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
      })
    )
    .mutation(({ input, ctx }) =>
      testIntegrationConnection(ctx.session.userId, input)
    ),
  // Back-compat alias for the export forms; same gate as `testConnection`.
  // TODO: remove once the dashboard calls `testConnection` directly.
  testExportConnection: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) =>
      testExportIntegrationConnection(ctx.session.userId, input)
    ),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input: { id }, ctx }) =>
      deleteIntegration(ctx.session.userId, id)
    ),
});

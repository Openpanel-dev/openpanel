// Ported from packages/trpc/src/routers/integration.ts (M6-006).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// Every access assertion (including the data-dependent "authorize against the
// EXISTING row" rule) lives in integration.service.ts, not here — see that
// file's header for why.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
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

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const integrationRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input, ctx }) =>
      getIntegrationById(ctx, requireLogin(ctx.session.userId), input.id)
    ),

  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) =>
      listIntegrationsForProject(
        ctx,
        requireLogin(ctx.session.userId),
        input.projectId
      )
    ),

  createOrUpdateSlack: protectedProcedure
    .input(zCreateSlackIntegration)
    .mutation(({ input, ctx }) =>
      createOrUpdateSlackIntegration(
        ctx,
        requireLogin(ctx.session.userId),
        input
      )
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
    .mutation(({ input, ctx }) =>
      upsertIntegration(ctx, requireLogin(ctx.session.userId), input)
    ),

  // Back-compat alias for the export forms; delegates to the same generic path.
  // TODO: remove once the dashboard calls `createOrUpdate` directly.
  createOrUpdateExport: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) =>
      upsertIntegration(ctx, requireLogin(ctx.session.userId), input)
    ),

  testConnection: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      })
    )
    .mutation(({ input, ctx }) =>
      testIntegrationConnection(ctx, requireLogin(ctx.session.userId), input)
    ),

  // Back-compat alias for the export forms; same gate as `testConnection`.
  // TODO: remove once the dashboard calls `testConnection` directly.
  testExportConnection: protectedProcedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) =>
      testExportIntegrationConnection(
        ctx,
        requireLogin(ctx.session.userId),
        input
      )
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input: { id }, ctx }) =>
      deleteIntegration(ctx, requireLogin(ctx.session.userId), id)
    ),
});

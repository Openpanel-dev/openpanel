// Ported from packages/trpc/src/routers/integration.ts (M6-006).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's integration functions (DELEGATE
// PATTERN), so nothing here is a live regression.
//
// Every access assertion (including the data-dependent "authorize against the
// EXISTING row" rule) lives in integration.service.ts, not here — see that
// file's header for why.

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
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
  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ input, ctx }) =>
      getIntegrationById(requireLogin(ctx.session.userId), input.id)
    ),

  list: procedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) =>
      listIntegrationsForProject(
        requireLogin(ctx.session.userId),
        input.projectId
      )
    ),

  createOrUpdateSlack: procedure
    .input(zCreateSlackIntegration)
    .mutation(({ input, ctx }) =>
      createOrUpdateSlackIntegration(requireLogin(ctx.session.userId), input)
    ),

  // Generic create/update for any form-configured integration. Per-type
  // behavior lives in the server plugin; no switch here.
  createOrUpdate: procedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      })
    )
    .mutation(({ input, ctx }) =>
      upsertIntegration(requireLogin(ctx.session.userId), input)
    ),

  // Back-compat alias for the export forms; delegates to the same generic path.
  // TODO: remove once the dashboard calls `createOrUpdate` directly.
  createOrUpdateExport: procedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) =>
      upsertIntegration(requireLogin(ctx.session.userId), input)
    ),

  testConnection: procedure
    .input(
      z.object({
        projectId: z.string().min(1),
        config: zIntegrationConfig,
      })
    )
    .mutation(({ input, ctx }) =>
      testIntegrationConnection(requireLogin(ctx.session.userId), input)
    ),

  // Back-compat alias for the export forms; same gate as `testConnection`.
  // TODO: remove once the dashboard calls `testConnection` directly.
  testExportConnection: procedure
    .input(z.union([zCreateS3ExportIntegration, zCreateGCSExportIntegration]))
    .mutation(({ input, ctx }) =>
      testExportIntegrationConnection(requireLogin(ctx.session.userId), input)
    ),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input: { id }, ctx }) =>
      deleteIntegration(requireLogin(ctx.session.userId), id)
    ),
});

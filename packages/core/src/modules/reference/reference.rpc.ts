// Ported from packages/trpc/src/routers/reference.ts (M6-004).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's reference functions (DELEGATE
// PATTERN) — this module has no queue/cron of its own, so there is no
// `ctx.services.reference`, same as `user`/`conversation`.
//
// The per-project access ladder itself IS shared: `./src/access.ts` binds
// core's shared/access.ts ladder to @openpanel/db's real lookups, the same
// way packages/trpc/src/access.ts does for V1. `create` has no access check
// here either — same gap V1's router has (ported verbatim, not fixed).

import { zCreateReference, zRange } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCForbiddenError } from '../../rpc/errors';
import {
  createReference,
  deleteReference,
  getChartReferences,
  getReferenceByIdOrThrow,
  listReferences,
  updateReference,
} from './reference.service';

function loadAccessChecks() {
  return import('./src/access');
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const referenceRouter = createTRPCRouter({
  getReferences: procedure
    .input(z.object({ projectId: z.string(), cursor: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { getProjectAccess } = await loadAccessChecks();
      const access = await getProjectAccess({
        userId,
        projectId: input.projectId,
      });
      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }
      return listReferences(input);
    }),

  create: procedure.input(zCreateReference).mutation(({ input, ctx }) => {
    requireLogin(ctx.session.userId);
    return createReference(input);
  }),

  update: procedure
    .input(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullish(),
        datetime: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const existing = await getReferenceByIdOrThrow(input.id);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: existing.projectId,
        level: 'write',
      });
      return updateReference(input);
    }),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const existing = await getReferenceByIdOrThrow(input.id);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: existing.projectId,
        level: 'write',
      });
      return deleteReference(input.id);
    }),

  getChartReferences: procedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
      })
    )
    .query(({ input }) => getChartReferences(input)),
});

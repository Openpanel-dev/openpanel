// Ported from packages/trpc/src/routers/reference.ts (M6-004).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// M10-003: the handler bodies reach the module through
// `ctx.services.reference`, so the requestId minted at the edge reaches the
// Postgres call (ADR-018).
//
// The permission ladder itself is bound once, in auth.service.ts (M10-002);
// every procedure here reaches it through `ctx.services.auth`. `create` has
// no access check here either — same gap V1's router has (ported verbatim,
// not fixed).

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../../rpc/base';
import { TRPCForbiddenError } from '../../rpc/errors';
import { zRange } from '../report/report.constants';
import { zCreateReference } from './reference.constants';

export const referenceRouter = createTRPCRouter({
  getReferences: protectedProcedure
    .input(z.object({ projectId: z.string(), cursor: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const access = await ctx.services.auth.getProjectAccess({
        userId,
        projectId: input.projectId,
      });
      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }
      return ctx.services.reference.listReferences(input);
    }),

  create: protectedProcedure
    .input(zCreateReference)
    .mutation(({ input, ctx }) => {
      return ctx.services.reference.createReference(input);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullish(),
        datetime: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const existing = await ctx.services.reference.getReferenceByIdOrThrow(
        input.id
      );
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: existing.projectId,
        level: 'write',
      });
      return ctx.services.reference.updateReference(input);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const existing = await ctx.services.reference.getReferenceByIdOrThrow(
        input.id
      );
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: existing.projectId,
        level: 'write',
      });
      return ctx.services.reference.deleteReference(input.id);
    }),

  getChartReferences: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
      })
    )
    .query(async ({ input, ctx }) => {
      // Public so a share page can draw annotations on its charts, but never
      // without a check: a member needs project access, an anonymous viewer
      // needs an unlocked public share for the project (GHSA-vrrm-p9p4-2gfg).
      const allowed = ctx.session.userId
        ? await ctx.services.auth.getProjectAccess({
            userId: ctx.session.userId,
            projectId: input.projectId,
          })
        : await ctx.services.share.hasAnonymousShareAccessToProject(
            input.projectId,
            ctx.cookies
          );
      if (!allowed) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }
      return ctx.services.reference.getChartReferences(input);
    }),
});

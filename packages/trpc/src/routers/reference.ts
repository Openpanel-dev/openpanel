// Dissolved into @openpanel/core's reference module (M6-004): the
// query/mutation bodies moved to
// packages/core/src/modules/reference/reference.service.ts. This router
// stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure stack
// (session/access/logger middleware) and delegates every handler body to
// core's reference functions, same as organization's router does (M6-001).
// `create` has no access check here either — same gap core's own router has
// (ported verbatim, not fixed).

import {
  createReference,
  deleteReference,
  getChartReferences,
  getReferenceByIdOrThrow,
  listReferences,
  updateReference,
} from '@openpanel/core';
import { zCreateReference, zRange } from '@openpanel/validation';
import { z } from 'zod';
import { getProjectAccess, requireProjectAccess } from '../access';
import { TRPCForbiddenError } from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

export const referenceRouter = createTRPCRouter({
  getReferences: protectedProcedure
    .input(z.object({ projectId: z.string(), cursor: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return listReferences(input);
    }),

  create: protectedProcedure
    .input(zCreateReference)
    .mutation(({ input }) => createReference(input)),

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
      const existing = await getReferenceByIdOrThrow(input.id);

      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: existing.projectId,
        level: 'write',
      });

      return updateReference(input);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id }, ctx }) => {
      const reference = await getReferenceByIdOrThrow(id);

      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: reference.projectId,
        level: 'write',
      });

      return deleteReference(id);
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
    .query(({ input }) => getChartReferences(input)),
});

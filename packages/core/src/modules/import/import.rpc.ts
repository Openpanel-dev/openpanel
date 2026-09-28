//
// Every procedure is on its V1 twin's builder. `protectedProcedure` runs
// `enforceUserIsAuthed` + `enforceAccess` BEFORE the input parser, exactly as
// V1 does. The explicit checks in the handlers below stay: `enforceAccess` only
// sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved from
// another id needs its own.
//
// V1's router has no compute-heavy or ClickHouse-touching logic to delegate (it
// is Prisma CRUD + a BullMQ enqueue, unlike gsc/cohort), so
// packages/trpc/src/routers/import.ts stays completely unmodified — there is
// nothing here for it to delegate to.
//
// The per-project access ladder itself is bound once, in auth.service.ts; every
// procedure here reaches it through `ctx.services.auth`.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCBadRequestError, TRPCNotFoundError } from '../../rpc/errors';
import { zCreateImport } from './import.constants';

export const importRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const db = ctx.db;
      return db.import.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
      });
    }),

  create: protectedProcedure
    .input(zCreateImport)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'write',
      });

      const db = ctx.db;
      const organization = await db.organization.findFirst({
        where: { projects: { some: { id: input.projectId } } },
      });

      if (!organization) {
        throw new TRPCNotFoundError(
          'Could not start import, organization not found'
        );
      }

      if (!organization.isActive) {
        throw new TRPCBadRequestError(
          'You cannot start an import without an active subscription!'
        );
      }

      const importRecord = await db.import.create({
        data: {
          projectId: input.projectId,
          config: input.config,
          status: 'pending',
        },
      });

      const jobId = await ctx.services.import.enqueue(importRecord.id);

      await db.import.update({
        where: { id: importRecord.id },
        data: { jobId },
      });

      return { ...importRecord, jobId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const db = ctx.db;
      const importRecord = await db.import.findUniqueOrThrow({
        where: { id: input.id },
      });

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: importRecord.projectId,
        level: 'write',
      });

      if (importRecord.jobId) {
        await ctx.queues.import.import.remove(importRecord.jobId);
      }

      return db.import.delete({ where: { id: input.id } });
    }),

  retry: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const db = ctx.db;
      const importRecord = await db.import.findUniqueOrThrow({
        where: { id: input.id },
      });

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: importRecord.projectId,
        level: 'write',
      });

      // Only allow retry for failed imports
      if (importRecord.status !== 'failed') {
        throw new Error('Only failed imports can be retried');
      }

      const jobId = await ctx.services.import.enqueue(importRecord.id);

      return db.import.update({
        where: { id: importRecord.id },
        data: { jobId, status: 'pending', errorMessage: null },
      });
    }),
});

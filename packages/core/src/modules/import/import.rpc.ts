// Ported from packages/trpc/src/routers/import.ts (M5-004).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed` (same as cohort.rpc.ts / gsc.rpc.ts).
//
// V1's router has no compute-heavy or ClickHouse-touching logic to delegate
// (it is Prisma CRUD + a BullMQ enqueue, unlike gsc/cohort), so
// packages/trpc/src/routers/import.ts stays completely unmodified — there is
// nothing here for it to delegate to. This router exists to satisfy the
// module map ("R") and to serve core's own (not yet live) appRouter.
//
// The per-project access ladder itself is bound once, in auth.service.ts
// (M10-002); every procedure here reaches it through `ctx.services.auth`.

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import {
  TRPCAccessError,
  TRPCBadRequestError,
  TRPCNotFoundError,
} from '../../rpc/errors';
import { zCreateImport } from './import.constants';

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const importRouter = createTRPCRouter({
  list: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const db = await loadDb();
      return db.import.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
      });
    }),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const db = await loadDb();
      const importRecord = await db.import.findUniqueOrThrow({
        where: { id: input.id },
        include: { project: true },
      });

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: importRecord.projectId,
        level: 'read',
      });

      return importRecord;
    }),

  create: procedure.input(zCreateImport).mutation(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await ctx.services.auth.requireProjectAccess({
      userId,
      projectId: input.projectId,
      level: 'write',
    });

    const db = await loadDb();
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

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const db = await loadDb();
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

  retry: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const db = await loadDb();
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

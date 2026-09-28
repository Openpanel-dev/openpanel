import { z } from 'zod';

import { db } from '@openpanel/db';
import { importQueue } from '@openpanel/queue';
import { zCreateImport } from '@openpanel/validation';

import { getProjectAccess, requireProjectAccess } from '../access';
import {
  TRPCForbiddenError,
  TRPCBadRequestError,
  TRPCNotFoundError,
} from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const importRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      return db.import.findMany({
        where: {
          projectId: input.projectId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const importRecord = await db.import.findUniqueOrThrow({
        where: {
          id: input.id,
        },
        include: {
          project: true,
        },
      });

      const access = await getProjectAccess({
        projectId: importRecord.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this import');
      }

      return importRecord;
    }),

  create: protectedProcedure
    .input(zCreateImport)
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      const organization = await db.organization.findFirst({
        where: {
          projects: {
            some: {
              id: input.projectId,
            },
          },
        },
      });

      if (!organization) {
        throw new TRPCNotFoundError(
          'Could not start import, organization not found',
        );
      }

      if (!organization.isActive) {
        throw new TRPCBadRequestError(
          'You cannot start an import without an active subscription!',
        );
      }

      // Create import record
      const importRecord = await db.import.create({
        data: {
          projectId: input.projectId,
          config: input.config,
          status: 'pending',
        },
      });

      // Add job to queue
      const job = await importQueue.add('import', {
        type: 'import',
        payload: {
          importId: importRecord.id,
        },
      });

      // Update import record with job ID
      await db.import.update({
        where: { id: importRecord.id },
        data: { jobId: job.id },
      });

      return {
        ...importRecord,
        jobId: job.id,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const importRecord = await db.import.findUniqueOrThrow({
        where: {
          id: input.id,
        },
      });

      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: importRecord.projectId,
        level: 'write',
      });

      if (importRecord.jobId) {
        const job = await importQueue.getJob(importRecord.jobId);
        if (job) {
          await job.remove();
        }
      }

      return db.import.delete({
        where: {
          id: input.id,
        },
      });
    }),

  retry: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const importRecord = await db.import.findUniqueOrThrow({
        where: {
          id: input.id,
        },
      });

      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: importRecord.projectId,
        level: 'write',
      });

      // Only allow retry for failed imports. Checked-then-enqueued atomically:
      // two concurrent retry calls both reading status 'failed' before either
      // writes would otherwise enqueue two jobs for the same importId, and
      // the worker's success-path cleanup deletes staging rows by importId —
      // one job finishing would delete rows the other has staged but not yet
      // consumed.
      const { count } = await db.import.updateMany({
        where: { id: importRecord.id, status: 'failed' },
        data: { status: 'pending', errorMessage: null },
      });
      if (count === 0) {
        throw new Error('Only failed imports can be retried');
      }

      // Add new job to queue
      let job: Awaited<ReturnType<typeof importQueue.add>>;
      try {
        job = await importQueue.add('import', {
          type: 'import',
          payload: {
            importId: importRecord.id,
          },
        });
      } catch (error) {
        // The status flip above already landed. If enqueueing rejects, revert
        // it so the import isn't stuck in 'pending' forever with no job and
        // no way to retry again -- 'pending' isn't one of the statuses retry
        // accepts. This can't distinguish "definitely never enqueued" from
        // "enqueued but the acknowledgement was lost"; the former is the
        // overwhelmingly likely failure (add() rejects outright when Redis is
        // unreachable) and is what this guards against.
        await db.import.updateMany({
          where: { id: importRecord.id, status: 'pending' },
          data: { status: 'failed' },
        });
        throw error;
      }

      // Update import record
      return db.import.update({
        where: { id: importRecord.id },
        data: {
          jobId: job.id,
        },
      });
    }),
});

import { z } from 'zod';

import { db } from '@openpanel/db';
import { importQueue } from '@openpanel/queue';
import { type IImportConfig, zCreateImport } from '@openpanel/validation';

import { getProjectAccessCached } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const importRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccessCached({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
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

      const access = await getProjectAccessCached({
        projectId: importRecord.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this import');
      }

      return importRecord;
    }),

  create: protectedProcedure
    .input(zCreateImport)
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccessCached({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access || (typeof access !== 'boolean' && access.level === 'read')) {
        throw TRPCAccessError(
          'You do not have permission to create imports for this project',
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

      const access = await getProjectAccessCached({
        projectId: importRecord.projectId,
        userId: ctx.session.userId,
      });

      if (!access || (typeof access !== 'boolean' && access.level === 'read')) {
        throw TRPCAccessError(
          'You do not have permission to delete imports for this project',
        );
      }

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

      const access = await getProjectAccessCached({
        projectId: importRecord.projectId,
        userId: ctx.session.userId,
      });

      if (!access || (typeof access !== 'boolean' && access.level === 'read')) {
        throw TRPCAccessError(
          'You do not have permission to retry imports for this project',
        );
      }

      // Only allow retry for failed imports
      if (importRecord.status !== 'failed') {
        throw new Error('Only failed imports can be retried');
      }

      // Add new job to queue
      const job = await importQueue.add('import', {
        type: 'import',
        payload: {
          importId: importRecord.id,
        },
      });

      // Update import record
      return db.import.update({
        where: { id: importRecord.id },
        data: {
          jobId: job.id,
          status: 'pending',
          errorMessage: null,
        },
      });
    }),
});

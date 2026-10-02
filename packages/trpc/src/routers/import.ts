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

/**
 * Deterministic BullMQ job id for an import, keyed on the import id.
 *
 * `importQueue.add` without an explicit id mints a random one, so a retry
 * issued after an ambiguous enqueue outcome (Redis persisted the job but the
 * acknowledgement was lost) would enqueue a second job for the same import.
 * Two jobs for one import id interfere with each other: the worker cleans
 * staging rows by import id, so one job finishing can delete rows the other
 * has staged but not yet consumed. A stable id lets any retry find, adopt,
 * or clear the previous attempt's job instead of duplicating it.
 */
const getImportJobId = (importId: string) => `import-${importId}`;

function isFinishedImportJobState(state: string | undefined) {
  return state === 'completed' || state === 'failed';
}

/**
 * Enqueue the import job without ever leaving two live jobs behind.
 *
 * A live job for this import (a duplicate retry, or a previous attempt whose
 * acknowledgement was lost) is adopted as-is. A lingering finished job only
 * holds the deterministic id (completed/failed jobs are kept, not removed),
 * so it is cleared first and the fresh attempt takes the id.
 */
async function enqueueImportJob(importId: string) {
  const jobId = getImportJobId(importId);
  const existing = await importQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (!isFinishedImportJobState(state)) {
      return existing;
    }
    await existing.remove();
  }
  return importQueue.add(
    'import',
    {
      type: 'import',
      payload: {
        importId,
      },
    },
    { jobId },
  );
}

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

      // Add job to queue. The import id is fresh, so the deterministic id
      // cannot collide; it lets reconcile find this job if the ack is lost.
      const job = await importQueue.add(
        'import',
        {
          type: 'import',
          payload: {
            importId: importRecord.id,
          },
        },
        { jobId: getImportJobId(importRecord.id) },
      );

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

  /**
   * Re-enqueue a failed import.
   *
   * The failed->pending flip is atomic (updateMany with the status in the
   * where clause), so two concurrent callers cannot both win it. Enqueueing
   * uses a deterministic job id: on an ambiguous outcome the previous
   * attempt's job is adopted instead of duplicated, and only a
   * confirmed-missing job reverts the import to failed.
   */
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

      // Atomic failed->pending transition: only one of two concurrent retry
      // calls can win it.
      const { count } = await db.import.updateMany({
        where: { id: importRecord.id, status: 'failed' },
        data: { status: 'pending', errorMessage: null },
      });
      if (count === 0) {
        throw new Error('Only failed imports can be retried');
      }

      const jobId = getImportJobId(importRecord.id);
      let job: Awaited<ReturnType<typeof importQueue.add>>;
      try {
        job = await enqueueImportJob(importRecord.id);
      } catch (error) {
        // Enqueueing rejected. That spans definite failures (Redis
        // unreachable: nothing was persisted) and ambiguous ones (the job was
        // persisted but the acknowledgement was lost). Reverting to failed on
        // an ambiguous outcome would permit a second retry and two live jobs
        // for one import, so confirm first: a surviving job is adopted and
        // the import stays pending; only a confirmed-missing job reverts to
        // failed and stays retryable. If even the lookup fails, revert: the
        // deterministic id makes the next retry adopt-or-replace instead of
        // duplicating, so retryability wins over a stuck pending.
        const existing = await importQueue.getJob(jobId).catch(() => undefined);
        const state = existing
          ? await existing.getState().catch(() => 'unknown')
          : undefined;
        if (existing && !isFinishedImportJobState(state)) {
          return db.import.update({
            where: { id: importRecord.id },
            data: { jobId: existing.id ?? jobId },
          });
        }
        await db.import.updateMany({
          where: { id: importRecord.id, status: 'pending' },
          data: { status: 'failed', errorMessage: importRecord.errorMessage },
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

  /**
   * Recovery path for an import stuck in pending with no live job (e.g. an
   * enqueue whose acknowledgement was lost before job adoption, or a crash
   * between the status flip and the enqueue).
   *
   * Never touches imports with a live job, and never auto-fails an import
   * whose job completed: staged rows may already be in production, and a
   * blind retry could duplicate them. Those need a human look.
   */
  reconcile: protectedProcedure
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

      if (importRecord.status !== 'pending') {
        return { status: importRecord.status, action: 'none' as const };
      }

      const candidates = [
        importRecord.jobId,
        getImportJobId(importRecord.id),
      ].filter((id): id is string => typeof id === 'string' && id.length > 0);

      let liveJobId: string | undefined;
      let completed = false;
      for (const candidate of new Set(candidates)) {
        const job = await importQueue.getJob(candidate).catch(() => undefined);
        if (!job) {
          continue;
        }
        const state = await job.getState().catch(() => 'unknown');
        if (!isFinishedImportJobState(state)) {
          liveJobId = job.id ?? candidate;
          break;
        }
        if (state === 'completed') {
          completed = true;
        }
      }

      if (liveJobId) {
        // A job is (still) covering this import. Point the record at it and
        // leave the import pending.
        if (importRecord.jobId !== liveJobId) {
          await db.import.update({
            where: { id: importRecord.id },
            data: { jobId: liveJobId },
          });
        }
        return { status: 'pending' as const, action: 'adopted' as const };
      }

      if (completed) {
        return { status: 'pending' as const, action: 'none' as const };
      }

      // No live job and nothing completed: mark failed so retry can pick it
      // up again with a deterministic job id.
      await db.import.updateMany({
        where: { id: importRecord.id, status: 'pending' },
        data: {
          status: 'failed',
          errorMessage:
            importRecord.errorMessage ??
            'No live import job found; marked as failed for retry.',
        },
      });
      return { status: 'failed' as const, action: 'marked-failed' as const };
    }),
});

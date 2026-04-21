import { z } from 'zod';

import {
  computeCohort,
  countCohort,
  db,
  deleteCohortMembership,
  enqueueCohortCompute,
  getCohortCount,
  getCohortEventsPerDay,
  getCohortMemberEvents,
  getCohortMemberRoutes,
  getCohortMembers,
  listCohortMemberProfiles,
  removeCohortComputeJob,
} from '@openpanel/db';
import {
  type CohortDefinition,
  zCohortDefinition,
  zCohortInput,
  zCohortUpdate,
} from '@openpanel/validation';

import { getProjectAccess } from '../access';
import { TRPCAccessError, TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const cohortRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        includeCount: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ input }) => {
      const cohorts = await db.cohort.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
      });

      if (input.includeCount) {
        return cohorts.map((cohort) => ({
          ...cohort,
          currentCount: cohort.profileCount ?? 0,
        }));
      }

      return cohorts;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const cohort = await db.cohort.findUnique({
        where: { id: input.id },
      });

      if (!cohort) {
        throw TRPCNotFoundError('Cohort not found');
      }

      const access = await getProjectAccess({
        projectId: cohort.projectId,
        userId: ctx.session.userId!,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      return cohort;
    }),

  create: protectedProcedure
    .input(zCohortInput)
    .mutation(async ({ input }) => {
      const cohort = await db.cohort.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          definition: input.definition,
          isStatic: input.isStatic,
        },
      });

      await enqueueCohortCompute(cohort.id);

      return cohort;
    }),

  update: protectedProcedure
    .input(zCohortUpdate)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      const existingCohort = await db.cohort.findUnique({ where: { id } });

      if (!existingCohort) {
        throw TRPCNotFoundError('Cohort not found');
      }

      const access = await getProjectAccess({
        projectId: existingCohort.projectId,
        userId: ctx.session.userId!,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      const cohort = await db.cohort.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.definition && { definition: data.definition }),
          ...(data.isStatic !== undefined && { isStatic: data.isStatic }),
        },
      });

      if (data.definition) {
        await enqueueCohortCompute(cohort.id);
      }

      return cohort;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const cohort = await db.cohort.findUnique({ where: { id: input.id } });

      if (!cohort) {
        throw TRPCNotFoundError('Cohort not found');
      }

      const access = await getProjectAccess({
        projectId: cohort.projectId,
        userId: ctx.session.userId!,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      await db.cohort.delete({ where: { id: input.id } });

      deleteCohortMembership(input.id, cohort.projectId).catch((err) => {
        console.error('Failed to cleanup cohort CH data:', err);
      });

      return { success: true };
    }),

  listProfiles: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cohortId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const { data, count } = await listCohortMemberProfiles(input);
      return {
        data,
        meta: { count, pageCount: input.take },
      };
    }),

  mostEvents: protectedProcedure
    .input(
      z.object({ projectId: z.string(), cohortId: z.string() }),
    )
    .query(({ input }) =>
      getCohortMemberEvents(input.projectId, input.cohortId),
    ),

  eventsPerDay: protectedProcedure
    .input(
      z.object({ projectId: z.string(), cohortId: z.string() }),
    )
    .query(({ input }) =>
      getCohortEventsPerDay(input.projectId, input.cohortId),
    ),

  popularRoutes: protectedProcedure
    .input(
      z.object({ projectId: z.string(), cohortId: z.string() }),
    )
    .query(({ input }) =>
      getCohortMemberRoutes(input.projectId, input.cohortId),
    ),

  getCount: protectedProcedure
    .input(z.object({ cohortId: z.string() }))
    .query(async ({ input, ctx }) => {
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw TRPCNotFoundError('Cohort not found');
      }

      const access = await getProjectAccess({
        projectId: cohort.projectId,
        userId: ctx.session.userId!,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      const count = await getCohortCount(input.cohortId, cohort.projectId);
      return { count };
    }),

  preview: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        definition: zCohortDefinition,
      }),
    )
    .query(async ({ input }) => {
      const definition = input.definition as CohortDefinition;
      const count = await countCohort(input.projectId, definition);
      const sampleProfiles = await computeCohort(
        input.projectId,
        definition,
        10,
      );
      return { count, sampleProfiles };
    }),

  exportProfiles: protectedProcedure
    .input(
      z.object({
        cohortId: z.string(),
        limit: z.number().int().min(1).max(10000).default(10000),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw TRPCNotFoundError('Cohort not found');
      }

      const access = await getProjectAccess({
        projectId: cohort.projectId,
        userId: ctx.session.userId!,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      const result = await getCohortMembers(input.cohortId, cohort.projectId, {
        limit: input.limit,
        offset: input.offset,
      });

      return {
        profileIds: result.profileIds,
        total: result.total,
        cohortName: cohort.name,
      };
    }),

  refresh: protectedProcedure
    .input(z.object({ cohortId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw TRPCNotFoundError('Cohort not found');
      }

      const access = await getProjectAccess({
        projectId: cohort.projectId,
        userId: ctx.session.userId!,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      if (cohort.isStatic) {
        throw new Error(
          'Cannot refresh static cohorts — they are one-time snapshots',
        );
      }

      await removeCohortComputeJob(input.cohortId);
      await enqueueCohortCompute(input.cohortId);

      return { success: true };
    }),
});

import { z } from 'zod';

import {
  TABLE_NAMES,
  chQuery,
  computeCohort,
  countCohort,
  db,
  deleteCohortMembership,
  enqueueCohortCompute,
  getCohortCount,
  getCohortMembers,
} from '@openpanel/db';
import {
  type CohortDefinition,
  zCohortDefinition,
  zCohortInput,
  zCohortUpdate,
} from '@openpanel/validation';
import sqlstring from 'sqlstring';

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

  getProfiles: protectedProcedure
    .input(
      z.object({
        cohortId: z.string(),
        limit: z.number().int().min(1).max(500).default(50),
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

      if (result.profileIds.length > 0) {
        const profiles = await chQuery<{
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          properties: Record<string, string>;
          created_at: string;
        }>(`
          SELECT id, email, first_name, last_name, properties, created_at
          FROM ${TABLE_NAMES.profiles} FINAL
          WHERE project_id = ${sqlstring.escape(cohort.projectId)}
            AND id IN (${result.profileIds.map((id) => sqlstring.escape(id)).join(',')})
        `);

        return {
          profiles,
          total: result.total,
        };
      }

      return {
        profiles: [],
        total: result.total,
      };
    }),

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

      await enqueueCohortCompute(input.cohortId);

      return { success: true };
    }),
});

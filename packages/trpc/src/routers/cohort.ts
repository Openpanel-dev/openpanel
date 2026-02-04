import { z } from 'zod';

import {
  chQuery,
  computeCohort,
  countCohort,
  db,
  getCohortCount,
  getCohortMembers,
  TABLE_NAMES,
  updateCohortMembership,
} from '@openpanel/db';
import type { CohortDefinition } from '@openpanel/validation';
import { zCohortDefinition, zCohortInput, zCohortUpdate } from '@openpanel/validation';
import sqlstring from 'sqlstring';

import { getProjectAccess } from '../access';
import { TRPCAccessError, TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const cohortRouter = createTRPCRouter({
  /**
   * List all cohorts for a project
   */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        includeCount: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      const cohorts = await db.cohort.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
      });

      if (input.includeCount) {
        // Enrich with current counts
        return Promise.all(
          cohorts.map(async (cohort) => ({
            ...cohort,
            currentCount: await getCohortCount(cohort.id, cohort.projectId),
          })),
        );
      }

      return cohorts;
    }),

  /**
   * Get single cohort by ID
   */
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
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      return cohort;
    }),

  /**
   * Create new cohort
   */
  create: protectedProcedure
    .input(zCohortInput)
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      // Create cohort
      const cohort = await db.cohort.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          definition: input.definition as any, // Prisma Json type
          isStatic: input.isStatic,
          computeOnDemand: input.computeOnDemand,
        },
      });

      // Trigger initial computation if not on-demand
      if (!cohort.computeOnDemand) {
        // Run in background - don't await
        updateCohortMembership(cohort.id).catch((err) => {
          console.error('Failed to compute cohort on creation:', err);
        });
      }

      return cohort;
    }),

  /**
   * Update cohort
   */
  update: protectedProcedure
    .input(zCohortUpdate)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      const existingCohort = await db.cohort.findUnique({
        where: { id },
      });

      if (!existingCohort) {
        throw TRPCNotFoundError('Cohort not found');
      }

      const access = await getProjectAccess({
        projectId: existingCohort.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      const cohort = await db.cohort.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.definition && { definition: data.definition as any }),
          ...(data.isStatic !== undefined && { isStatic: data.isStatic }),
          ...(data.computeOnDemand !== undefined && {
            computeOnDemand: data.computeOnDemand,
          }),
        },
      });

      // If definition changed, trigger recomputation
      if (data.definition && !cohort.computeOnDemand) {
        updateCohortMembership(cohort.id).catch((err) => {
          console.error('Failed to recompute cohort after update:', err);
        });
      }

      return cohort;
    }),

  /**
   * Delete cohort
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const cohort = await db.cohort.findUnique({
        where: { id: input.id },
      });

      if (!cohort) {
        throw TRPCNotFoundError('Cohort not found');
      }

      const access = await getProjectAccess({
        projectId: cohort.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      await db.cohort.delete({
        where: { id: input.id },
      });

      // Cleanup ClickHouse data in background
      chQuery(`
        DELETE FROM ${TABLE_NAMES.cohort_members}
        WHERE cohort_id = ${sqlstring.escape(input.id)}
      `).catch((err) => {
        console.error('Failed to cleanup cohort_members:', err);
      });

      chQuery(`
        DELETE FROM ${TABLE_NAMES.cohort_metadata}
        WHERE cohort_id = ${sqlstring.escape(input.id)}
      `).catch((err) => {
        console.error('Failed to cleanup cohort_metadata:', err);
      });

      return { success: true };
    }),

  /**
   * Get cohort members with pagination
   */
  getProfiles: protectedProcedure
    .input(
      z.object({
        cohortId: z.string(),
        limit: z.number().min(1).max(500).default(50),
        offset: z.number().min(0).default(0),
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
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      const result = await getCohortMembers(
        input.cohortId,
        cohort.projectId,
        { limit: input.limit, offset: input.offset },
      );

      // Enrich with profile data
      if (result.profileIds.length > 0) {
        const profiles = await chQuery<{
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          properties: Record<string, string>;
          created_at: string;
        }>(`
          SELECT
            id,
            email,
            first_name,
            last_name,
            properties,
            created_at
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

  /**
   * Get cohort count
   */
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
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      const count = await getCohortCount(input.cohortId, cohort.projectId);
      return { count };
    }),

  /**
   * Preview cohort without saving
   */
  preview: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        definition: zCohortDefinition,
      }),
    )
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      const definition = input.definition as CohortDefinition;

      // Use COUNT to get total without loading all profiles into memory
      const count = await countCohort(input.projectId, definition);

      // Get just 10 sample profiles
      const sampleProfiles = await computeCohort(input.projectId, definition, 10);

      return {
        count,
        sampleProfiles,
      };
    }),

  /**
   * Manually trigger cohort refresh
   */
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
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this cohort');
      }

      await updateCohortMembership(input.cohortId);
      return { success: true };
    }),
});

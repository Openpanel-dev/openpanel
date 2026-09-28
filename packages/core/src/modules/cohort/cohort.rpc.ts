//
// Every procedure is on its V1 twin's builder. `protectedProcedure` runs
// `enforceUserIsAuthed` + `enforceAccess` BEFORE the input parser, exactly as
// V1 does. The explicit checks in the handlers below stay: `enforceAccess` only
// sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved from
// another id needs its own.
//
// The per-project access ladder itself is bound once, in auth.service.ts; every
// procedure here reaches it through `ctx.services.auth`.
//
// CRUD (list/get/create/update/delete) reads/writes Prisma's `cohort` table
// directly, matching V1's router — cohort.service.ts owns only the
// compute-heavy and ClickHouse-touching operations, same split as V1.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCNotFoundError } from '../../rpc/errors';
import { getSettingsForProject } from '../organization/organization.service';
// The canonical zChartEventFilter, not cohort.constants.ts's private
// TDZ-workaround copy — matches V1's router, which imports it from
// packages/validation's barrel rather than from cohort.validation.ts.
import { zChartEventFilter, zRange } from '../report/report.constants';
import { getChartStartEndDate } from '../report/src/chart-dates';
import {
  zCohortDefinition,
  zCohortInput,
  zCohortUpdate,
} from './cohort.constants';
import {
  computeCohort,
  countCohort,
  deleteCohortMembership,
  getCohortCount,
  getCohortEventsPerDay,
  getCohortMemberEvents,
  getCohortMemberRoutes,
  getCohortMembers,
  listCohortMemberProfiles,
} from './cohort.service';

const EXPORT_PROFILES_MAX_LIMIT = 10_000;
const EXPORT_PROFILES_DEFAULT_LIMIT = 10_000;

/**
 * `mostEvents` and `popularRoutes` read the project's whole history before this
 * window existed. The default is the one `profile.powerUsers` got for the same
 * cause; the cohort page passes no range, so this is what it shows.
 */
const COHORT_ACTIVITY_DEFAULT_RANGE = '3m';

const zCohortActivityInput = z.object({
  projectId: z.string(),
  cohortId: z.string(),
  range: zRange.default(COHORT_ACTIVITY_DEFAULT_RANGE),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
});

export const cohortRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        includeCount: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const db = ctx.db;
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
      const userId = ctx.session.userId;
      const db = ctx.db;
      const cohort = await db.cohort.findUnique({
        where: { id: input.id },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'read',
      });

      return cohort;
    }),

  // No project-access check here, matching V1 (packages/trpc/src/routers/
  // cohort.ts) exactly — protectedProcedure's session check is the only gate
  // today. Preserved as found: ADR-011 invariant 1 forbids deleting an
  // in-handler check, and this router does not serve live traffic yet.
  create: protectedProcedure
    .input(zCohortInput)
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const cohort = await db.cohort.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          definition: input.definition,
          isStatic: input.isStatic,
        },
      });

      await ctx.services.cohort.enqueueCompute(cohort.id);

      return cohort;
    }),

  update: protectedProcedure
    .input(zCohortUpdate)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const { id, ...data } = input;

      const db = ctx.db;
      const existingCohort = await db.cohort.findUnique({ where: { id } });

      if (!existingCohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: existingCohort.projectId,
        level: 'write',
      });

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
        await ctx.services.cohort.enqueueCompute(cohort.id);
      }

      return cohort;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const db = ctx.db;
      const cohort = await db.cohort.findUnique({
        where: { id: input.id },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'write',
      });

      await db.cohort.delete({ where: { id: input.id } });

      deleteCohortMembership(ctx, input.id, cohort.projectId).catch((err) => {
        ctx.logger.error({ err }, 'Failed to cleanup cohort CH data');
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
        filters: z.array(zChartEventFilter).default([]),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { data, count } = await listCohortMemberProfiles(ctx, input);
      return {
        data,
        meta: { count, pageCount: input.take },
      };
    }),

  mostEvents: protectedProcedure
    .input(zCohortActivityInput)
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return getCohortMemberEvents(
        ctx,
        input.projectId,
        input.cohortId,
        getChartStartEndDate(input, timezone)
      );
    }),

  eventsPerDay: protectedProcedure
    .input(z.object({ projectId: z.string(), cohortId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getCohortEventsPerDay(ctx, input.projectId, input.cohortId);
    }),

  popularRoutes: protectedProcedure
    .input(zCohortActivityInput)
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return getCohortMemberRoutes(
        ctx,
        input.projectId,
        input.cohortId,
        getChartStartEndDate(input, timezone)
      );
    }),

  getCount: protectedProcedure
    .input(z.object({ cohortId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const db = ctx.db;
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'read',
      });

      const count = await getCohortCount(ctx, input.cohortId, cohort.projectId);
      return { count };
    }),

  preview: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        definition: zCohortDefinition,
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const count = await countCohort(ctx, input.projectId, input.definition);
      const sampleProfiles = await computeCohort(
        ctx,
        input.projectId,
        input.definition,
        10
      );
      return { count, sampleProfiles };
    }),

  exportProfiles: protectedProcedure
    .input(
      z.object({
        cohortId: z.string(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(EXPORT_PROFILES_MAX_LIMIT)
          .default(EXPORT_PROFILES_DEFAULT_LIMIT),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const db = ctx.db;
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'read',
      });

      const result = await getCohortMembers(
        ctx,
        input.cohortId,
        cohort.projectId,
        {
          limit: input.limit,
          offset: input.offset,
        }
      );

      return {
        profileIds: result.profileIds,
        total: result.total,
        cohortName: cohort.name,
      };
    }),

  refresh: protectedProcedure
    .input(z.object({ cohortId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.userId;
      const db = ctx.db;
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'write',
      });

      if (cohort.isStatic) {
        throw new Error(
          'Cannot refresh static cohorts — they are one-time snapshots'
        );
      }

      await ctx.services.cohort.enqueueCompute(input.cohortId);

      return { success: true };
    }),
});

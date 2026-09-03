// Ported from packages/trpc/src/routers/cohort.ts (M5-003).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's cohort functions and
// `ctx.services.cohort` (DELEGATE PATTERN), so nothing here is a live
// regression.
//
// The per-project access ladder itself IS shared: `./src/access.ts` binds
// core's shared/access.ts ladder to @openpanel/db's real lookups, the same
// way packages/trpc/src/access.ts does for V1.
//
// CRUD (list/get/create/update/delete) reads/writes Prisma's `cohort` table
// directly, matching V1's router — cohort.service.ts owns only the
// compute-heavy and ClickHouse-touching operations, same split as V1.

// The canonical zChartEventFilter, not cohort.constants.ts's private
// TDZ-workaround copy — matches V1's router, which imports it from
// @openpanel/validation's barrel rather than from cohort.validation.ts.
import { zChartEventFilter } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';
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

function loadAccessChecks() {
  return import('./src/access');
}

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const cohortRouter = createTRPCRouter({
  list: procedure
    .input(
      z.object({
        projectId: z.string(),
        includeCount: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const db = await loadDb();
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

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const db = await loadDb();
      const cohort = await db.cohort.findUnique({
        where: { id: input.id },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'read',
      });

      return cohort;
    }),

  // No project-access check here, matching V1 (packages/trpc/src/routers/
  // cohort.ts) exactly — protectedProcedure's session check is the only
  // gate today. Preserved as found: ADR-011 invariant 1 forbids deleting an
  // in-handler check, and this router does not serve live traffic yet.
  create: procedure.input(zCohortInput).mutation(async ({ input, ctx }) => {
    requireLogin(ctx.session.userId);

    const db = await loadDb();
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

  update: procedure.input(zCohortUpdate).mutation(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    const { id, ...data } = input;

    const db = await loadDb();
    const existingCohort = await db.cohort.findUnique({ where: { id } });

    if (!existingCohort) {
      throw new TRPCNotFoundError('Cohort not found');
    }

    const { requireProjectAccess } = await loadAccessChecks();
    await requireProjectAccess({
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

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const db = await loadDb();
      const cohort = await db.cohort.findUnique({
        where: { id: input.id },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'write',
      });

      await db.cohort.delete({ where: { id: input.id } });

      deleteCohortMembership(input.id, cohort.projectId).catch((err) => {
        ctx.logger.error({ err }, 'Failed to cleanup cohort CH data');
      });

      return { success: true };
    }),

  listProfiles: procedure
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
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { data, count } = await listCohortMemberProfiles(input);
      return {
        data,
        meta: { count, pageCount: input.take },
      };
    }),

  mostEvents: procedure
    .input(z.object({ projectId: z.string(), cohortId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getCohortMemberEvents(input.projectId, input.cohortId);
    }),

  eventsPerDay: procedure
    .input(z.object({ projectId: z.string(), cohortId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getCohortEventsPerDay(input.projectId, input.cohortId);
    }),

  popularRoutes: procedure
    .input(z.object({ projectId: z.string(), cohortId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getCohortMemberRoutes(input.projectId, input.cohortId);
    }),

  getCount: procedure
    .input(z.object({ cohortId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const db = await loadDb();
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'read',
      });

      const count = await getCohortCount(input.cohortId, cohort.projectId);
      return { count };
    }),

  preview: procedure
    .input(
      z.object({
        projectId: z.string(),
        definition: zCohortDefinition,
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'read',
      });

      const count = await countCohort(input.projectId, input.definition);
      const sampleProfiles = await computeCohort(
        input.projectId,
        input.definition,
        10
      );
      return { count, sampleProfiles };
    }),

  exportProfiles: procedure
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
      const userId = requireLogin(ctx.session.userId);
      const db = await loadDb();
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: cohort.projectId,
        level: 'read',
      });

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

  refresh: procedure
    .input(z.object({ cohortId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const db = await loadDb();
      const cohort = await db.cohort.findUnique({
        where: { id: input.cohortId },
      });

      if (!cohort) {
        throw new TRPCNotFoundError('Cohort not found');
      }

      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
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

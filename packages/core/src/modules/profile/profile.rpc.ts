// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { getSettingsForProject } from '../organization/organization.service';
import { zChartEventFilter, zRange } from '../report/report.constants';
import { getChartStartEndDate } from '../report/src/chart-dates';
import {
  getPowerUsers,
  getProfileActivity,
  getProfileById,
  getProfileListPage,
  getProfileMetrics,
  getProfileMostEvents,
  getProfilePopularRoutes,
  getProfilePropertyNames,
  getProfileValues,
} from './profile.service';
import { PROFILE_VALUE_COLUMNS } from './src/sql';

const DEFAULT_LIST_TAKE = 50;

/**
 * `list` and `powerUsers` had no date filter at all, so their cost grew with
 * the tenant's lifetime rather than with anything the caller chose
 * (`docs/ANALYTICS_PERFORMANCE.md` §6.8: 44.2 M rows read for one page of 50).
 * Both now take the report vocabulary's window; this is the default when the
 * caller names none, and it is the range §6.8 itself uses to describe the
 * change ("a power user over 90 days is not the same set as over all time").
 */
const PROFILE_WINDOW_DEFAULT_RANGE = '3m';

const zProfileWindow = {
  range: zRange.default(PROFILE_WINDOW_DEFAULT_RANGE),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
};

const zProfileRef = z.object({ profileId: z.string(), projectId: z.string() });

// The picker offers the bare columns plus any `properties.*` path. Validating
// here keeps an unknown column a 400 instead of `sql.id`'s SqlIdentifierError
// surfacing as a 500 (main #512, GHSA-4j6c-j6vc-xq96).
const zProfileValueProperty = z
  .string()
  .refine(
    (property) =>
      property.startsWith('properties.') ||
      (PROFILE_VALUE_COLUMNS as readonly string[]).includes(property),
    { message: 'Unknown profile property' }
  );

export const profileRouter = createTRPCRouter({
  byId: protectedProcedure.input(zProfileRef).query(async ({ input, ctx }) => {
    await ctx.services.auth.requireProjectAccess({
      userId: ctx.session.userId,
      projectId: input.projectId,
      level: 'read',
    });

    return getProfileById(ctx, input.profileId, input.projectId);
  }),

  metrics: protectedProcedure
    .input(zProfileRef)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getProfileMetrics(ctx, input.profileId, input.projectId);
    }),

  activity: protectedProcedure
    .input(zProfileRef)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getProfileActivity(ctx, input.profileId, input.projectId);
    }),

  mostEvents: protectedProcedure
    .input(zProfileRef)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getProfileMostEvents(ctx, input.profileId, input.projectId);
    }),

  popularRoutes: protectedProcedure
    .input(zProfileRef)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getProfilePopularRoutes(ctx, input.profileId, input.projectId);
    }),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getProfilePropertyNames(ctx, input.projectId);
    }),

  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(DEFAULT_LIST_TAKE),
        search: z.string().optional(),
        isExternal: z.boolean().optional(),
        filters: z.array(zChartEventFilter).default([]),
        ...zProfileWindow,
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return getProfileListPage(ctx, {
        ...input,
        ...getChartStartEndDate(input, timezone),
      });
    }),

  powerUsers: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(DEFAULT_LIST_TAKE),
        ...zProfileWindow,
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return getPowerUsers(ctx, {
        ...input,
        ...getChartStartEndDate(input, timezone),
      });
    }),

  values: protectedProcedure
    .input(z.object({ property: zProfileValueProperty, projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });

      return getProfileValues(ctx, input);
    }),
});

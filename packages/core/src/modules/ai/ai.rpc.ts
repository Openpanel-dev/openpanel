// `protectedProcedure` runs `enforceAccess` on the top-level `projectId`; the
// explicit checks below follow the tree-wide pattern.

import { getChartPrevStartEndDate } from '@openpanel/shared';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { TRPCNotFoundError } from '../../rpc/errors';
import { getSettingsForProject } from '../organization/organization.service';
import { zRange, zTimeInterval } from '../report/report.constants';
import { getChartStartEndDate } from '../report/src/chart-dates';
import {
  AI_BREAKDOWN_DEFAULT_LIMIT,
  AI_BREAKDOWN_DIMENSIONS,
  AI_BREAKDOWN_MAX_LIMIT,
  AI_LIST_DEFAULT_TAKE,
  AI_LIST_MAX_TAKE,
  zAiFilters,
} from './ai.constants';

const zScoped = z.object({
  projectId: z.string(),
  range: zRange.default('7d'),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  filters: zAiFilters.optional(),
});

const zTake = z
  .number()
  .int()
  .min(1)
  .max(AI_LIST_MAX_TAKE)
  .default(AI_LIST_DEFAULT_TAKE);

export const aiRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(
      zScoped.extend({
        interval: zTimeInterval.default('day'),
        previous: z.boolean().default(true),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      const current = getChartStartEndDate(input, timezone);
      const previous = getChartPrevStartEndDate(current);
      const [now, before] = await Promise.all([
        ctx.services.ai.getOverview({
          projectId: input.projectId,
          range: current,
          interval: input.interval,
          timezone,
          filters: input.filters,
        }),
        input.previous
          ? ctx.services.ai.getOverview({
              projectId: input.projectId,
              range: previous,
              interval: input.interval,
              timezone,
              filters: input.filters,
            })
          : null,
      ]);
      return {
        range: current,
        metrics: now.metrics,
        previousMetrics: before?.metrics ?? null,
        series: now.series.map((point, index) => ({
          ...point,
          previous: before?.series[index] ?? null,
        })),
      };
    }),

  breakdown: protectedProcedure
    .input(
      zScoped.extend({
        dimension: z.enum(AI_BREAKDOWN_DIMENSIONS),
        limit: z
          .number()
          .int()
          .min(1)
          .max(AI_BREAKDOWN_MAX_LIMIT)
          .default(AI_BREAKDOWN_DEFAULT_LIMIT),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return ctx.services.ai.getBreakdown({
        projectId: input.projectId,
        range: getChartStartEndDate(input, timezone),
        timezone,
        dimension: input.dimension,
        limit: input.limit,
        filters: input.filters,
      });
    }),

  traces: protectedProcedure
    .input(zScoped.extend({ take: zTake, cursor: z.string().nullish() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return ctx.services.ai.listTraces({
        projectId: input.projectId,
        range: getChartStartEndDate(input, timezone),
        timezone,
        take: input.take,
        cursor: input.cursor ?? undefined,
        filters: input.filters,
      });
    }),

  trace: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceId: z.string(),
        /** A ClickHouse timestamp near the trace, to prune partitions. */
        around: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const events = await ctx.services.ai.getTrace(input);
      if (events.length === 0) {
        throw new TRPCNotFoundError('Trace not found');
      }
      return events;
    }),

  events: protectedProcedure
    .input(zScoped.extend({ take: zTake, cursor: z.string().nullish() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return ctx.services.ai.listEvents({
        projectId: input.projectId,
        range: getChartStartEndDate(input, timezone),
        timezone,
        take: input.take,
        cursor: input.cursor ?? undefined,
        filters: input.filters,
      });
    }),

  event: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
        around: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const event = await ctx.services.ai.getEvent(input);
      if (!event) {
        throw new TRPCNotFoundError('AI event not found');
      }
      return event;
    }),

  profileSummary: protectedProcedure
    .input(z.object({ projectId: z.string(), profileId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.ai.getProfileSummary(input);
    }),

  groupSummary: protectedProcedure
    .input(z.object({ projectId: z.string(), groupId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.ai.getGroupSummary(input);
    }),

  sessionSummary: protectedProcedure
    .input(z.object({ projectId: z.string(), sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.ai.getSessionSummary(input);
    }),

  filterValues: protectedProcedure
    .input(zScoped.omit({ filters: true }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { timezone } = await getSettingsForProject(ctx, input.projectId);
      return ctx.services.ai.getFilterValues({
        projectId: input.projectId,
        range: getChartStartEndDate(input, timezone),
        timezone,
      });
    }),
});

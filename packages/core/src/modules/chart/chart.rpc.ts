// Ported from packages/trpc/src/routers/chart.ts (M7-003).
//
// Same arrangement as event.rpc.ts: V1's `protectedProcedure` / `cacheMiddleware`
// stacks land with auth (P6), so each procedure does its own "is anyone logged
// in" + `requireProjectAccess` off the `projectId` input, reached through
// `ctx.services.auth` (M10-002). packages/trpc's chart router delegates its
// handler bodies onto `./chart.service` while keeping V1's own procedure
// stack and 60s response cache.
//
// V1's `chartProcedure` (funnel, conversion, chart, aggregate, cohort) also
// admits anonymous callers holding a valid share: `shareId` + `id` resolve the
// saved report, and the request renders that report (the caller may only move
// the date window). `resolveShare` is that middleware, inlined.

import {
  type IReportInput,
  zChartEventFilter,
  zChartSeries,
  zCriteria,
  zRange,
  zReportInput,
  zTimeInterval,
} from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure, type TrpcContext } from '../../rpc/base';
import { TRPCAccessError, TRPCForbiddenError } from '../../rpc/errors';
import type { IServiceReport } from '../report/report.service';

const zShareable = z.object({
  shareId: z.string().optional(),
  id: z.string().optional(),
});

const zShareableReportInput = zReportInput.and(zShareable);

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireReadAccess(ctx: TrpcContext, projectId: string) {
  await ctx.services.auth.requireProjectAccess({
    userId: requireLogin(ctx.session.userId),
    projectId,
    level: 'read',
  });
}

/**
 * Share-aware access: with `shareId`, the share must be valid for the report
 * and the saved report is returned; without it, the caller must be a member.
 */
async function resolveShare(
  ctx: TrpcContext,
  input: { projectId: string; shareId?: string; id?: string }
): Promise<NonNullable<IServiceReport> | null> {
  if (!input.shareId) {
    await requireReadAccess(ctx, input.projectId);
    return null;
  }
  if (!input.id) {
    throw new Error('reportId required with shareId');
  }

  const shareValidation = await ctx.services.share.validateShareAccess(
    input.shareId,
    input.id,
    {
      cookies: ctx.cookies,
      session: ctx.session.userId ? { userId: ctx.session.userId } : undefined,
    }
  );
  if (!shareValidation.isValid) {
    throw new TRPCForbiddenError('You do not have access to this share');
  }

  const report = await ctx.services.report.getReportById(input.id);
  if (!report) {
    throw new TRPCAccessError('Report not found');
  }
  return report;
}

async function resolveShareableReport(
  ctx: TrpcContext,
  input: IReportInput & { shareId?: string; id?: string }
): Promise<IReportInput> {
  return ctx.services.chart.resolveReportInput(
    await resolveShare(ctx, input),
    input
  );
}

export const chartRouter = createTRPCRouter({
  projectCard: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);
      return ctx.services.chart.getProjectCard(input.projectId);
    }),

  events: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);
      return ctx.services.chart.listChartEvents(input.projectId);
    }),

  properties: procedure
    .input(z.object({ event: z.string().optional(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);
      return ctx.services.chart.listChartProperties(input);
    }),

  values: procedure
    .input(
      z.object({
        event: z.string(),
        property: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);
      return ctx.services.chart.getChartPropertyValues(input);
    }),

  funnel: procedure
    .input(zShareableReportInput)
    .query(async ({ input, ctx }) =>
      ctx.services.chart.getFunnelChart(
        await resolveShareableReport(ctx, input)
      )
    ),

  conversion: procedure
    .input(zShareableReportInput)
    .query(async ({ input, ctx }) =>
      ctx.services.chart.getConversionChart(
        await resolveShareableReport(ctx, input)
      )
    ),

  sankey: procedure.input(zReportInput).query(async ({ input, ctx }) => {
    await requireReadAccess(ctx, input.projectId);
    return ctx.services.chart.getSankeyChart(input);
  }),

  chart: procedure
    .input(zShareableReportInput)
    .query(async ({ input, ctx }) =>
      ctx.services.chart.execute(await resolveShareableReport(ctx, input))
    ),

  aggregate: procedure
    .input(zShareableReportInput)
    .query(async ({ input, ctx }) =>
      ctx.services.chart.executeAggregate(
        await resolveShareableReport(ctx, input)
      )
    ),

  cohort: procedure
    .input(
      z
        .object({
          projectId: z.string(),
          firstEvent: z.array(z.string()).min(1),
          secondEvent: z.array(z.string()).min(1),
          criteria: zCriteria.default('on_or_after'),
          startDate: z.string().nullish(),
          endDate: z.string().nullish(),
          interval: zTimeInterval.default('day'),
          range: zRange,
          filters: z.array(zChartEventFilter).optional(),
        })
        .and(zShareable)
    )
    .query(async ({ input, ctx }) =>
      ctx.services.chart.getRetentionChart(
        await resolveShare(ctx, input),
        input
      )
    ),

  getProfiles: procedure
    .input(
      z.object({
        projectId: z.string(),
        date: z.string().describe('The date for the data point (ISO string)'),
        interval: zTimeInterval.default('day'),
        series: zChartSeries,
        breakdowns: z.record(z.string(), z.string()).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);
      return ctx.services.chart.bucketProfiles(input);
    }),

  getFunnelProfiles: procedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        series: zChartSeries,
        stepIndex: z.number().describe('0-based index of the funnel step'),
        showDropoffs: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'If true, show users who dropped off at this step. If false, show users who completed at least this step.'
          ),
        funnelWindow: z.number().optional(),
        funnelGroup: z.string().optional(),
        breakdowns: z.array(z.object({ name: z.string() })).optional(),
        breakdownValues: z.array(z.string()).optional(),
        range: zRange,
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);
      return ctx.services.chart.funnelStepProfiles(input);
    }),
});

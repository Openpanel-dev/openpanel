// The six member-only procedures use `protectedProcedure`, so `enforceAccess`
// reads the top-level `projectId` before the input is parsed.
//
// `chartProcedure` (funnel, conversion, sankey, chart, aggregate, cohort) is the
// share-aware builder: an anonymous caller holding a valid share resolves the
// saved report, and the request renders that report (the caller may only move
// the date window). The resolved report rides on `ctx.report`, so a handler
// cannot forget to resolve it.

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  type TrpcContext,
} from '../../rpc/base';
import {
  TRPCBadRequestError,
  TRPCForbiddenError,
  TRPCNotFoundError,
} from '../../rpc/errors';
import {
  zChartEventFilter,
  zChartSeries,
  zCriteria,
  zRange,
  zReportInput,
  zTimeInterval,
} from '../report/report.constants';
import type { IServiceReport } from '../report/report.service';

const zShareable = z.object({
  shareId: z.string().optional(),
  id: z.string().optional(),
});

const zShareableReportInput = zReportInput.and(zShareable);

/**
 * Share-aware access: with `shareId`, the share must be valid for the report
 * and the saved report is returned; without it, the caller must be a member.
 */
async function resolveShare(
  ctx: TrpcContext,
  input: { projectId: string; shareId?: string; id?: string }
): Promise<NonNullable<IServiceReport> | null> {
  if (!input.shareId) {
    await ctx.services.auth.requireProjectAccess({
      userId: ctx.services.auth.requireLogin(ctx.session.userId),
      projectId: input.projectId,
      level: 'read',
    });
    return null;
  }
  if (!input.id) {
    throw new TRPCBadRequestError('reportId required with shareId');
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
    throw new TRPCNotFoundError('Report not found');
  }
  return report;
}

/**
 * The share/membership decision runs BEFORE the input is parsed and puts
 * the resolved report on the context, so a handler reads `ctx.report`
 * instead of re-deciding who may see it.
 */
const chartProcedure = publicProcedure.use(
  async ({ ctx, next, getRawInput }) => {
    const rawInput = (await getRawInput()) as {
      projectId: string;
      shareId?: string;
      id?: string;
    };
    return next({ ctx: { report: await resolveShare(ctx, rawInput) } });
  }
);

export const chartRouter = createTRPCRouter({
  projectCard: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.chart.getProjectCard(input.projectId);
    }),

  events: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.chart.listChartEvents(input.projectId);
    }),

  properties: protectedProcedure
    .input(z.object({ event: z.string().optional(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.chart.listChartProperties(input);
    }),

  values: protectedProcedure
    .input(
      z.object({
        event: z.string(),
        property: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.chart.getChartPropertyValues(input);
    }),

  funnel: chartProcedure
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      ctx.services.chart.getFunnelChart(
        ctx.services.chart.resolveReportInput(ctx.report, input)
      )
    ),

  conversion: chartProcedure
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      ctx.services.chart.getConversionChart(
        ctx.services.chart.resolveReportInput(ctx.report, input)
      )
    ),

  sankey: chartProcedure
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      ctx.services.chart.getSankeyChart(
        ctx.services.chart.resolveReportInput(ctx.report, input)
      )
    ),

  chart: chartProcedure
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      ctx.services.chart.execute(
        ctx.services.chart.resolveReportInput(ctx.report, input)
      )
    ),

  aggregate: chartProcedure
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      ctx.services.chart.executeAggregate(
        ctx.services.chart.resolveReportInput(ctx.report, input)
      )
    ),

  cohort: chartProcedure
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
    .query(({ input, ctx }) =>
      ctx.services.chart.getRetentionChart(ctx.report, input)
    ),

  getProfiles: protectedProcedure
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
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.chart.bucketProfiles(input);
    }),

  getFunnelProfiles: protectedProcedure
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
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      return ctx.services.chart.funnelStepProfiles(input);
    }),
});

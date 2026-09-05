// Dissolved into @openpanel/core's chart module (M7-003): the ClickHouse
// queries moved to packages/core/src/modules/chart/src/chart.sql.ts, the
// engine to src/engine/ and the handler bodies to chart.service.ts. This
// router stays (DELEGATE PATTERN) — it keeps V1's protectedProcedure /
// chartProcedure (share) / cacheMiddleware stacks and delegates every handler
// body to core's chart functions, same as event.ts.

import {
  executeAggregateChart,
  executeChart,
  getChartBucketProfiles,
  getChartPropertyValues,
  getConversionChart,
  getFunnelChart,
  getFunnelStepProfiles,
  getProjectCard,
  getReportById,
  getRetentionChart,
  getSankeyChart,
  listChartEvents,
  listChartProperties,
  resolveReportInput,
  validateShareAccess,
} from '@openpanel/core';
import {
  zChartEventFilter,
  zChartSeries,
  zCriteria,
  zRange,
  zReportInput,
  zTimeInterval,
} from '@openpanel/validation';
import { z } from 'zod';
import { getProjectAccess } from '../access';
import { TRPCAccessError, TRPCForbiddenError } from '../errors';
import {
  cacheMiddleware,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../trpc';

const cacher = cacheMiddleware(60);

const zShareable = z.object({
  shareId: z.string().optional(),
  id: z.string().optional(),
});

const zShareableReportInput = zReportInput.and(zShareable);

const chartProcedure = publicProcedure.use(
  async ({ ctx, next, getRawInput }) => {
    const rawInput = (await getRawInput()) as {
      projectId: string;
      shareId?: string;
      id?: string;
    };

    if (rawInput.shareId) {
      // Require reportId when shareId provided
      if (!rawInput.id) {
        throw new Error('reportId required with shareId');
      }

      // Validate share access
      const shareValidation = await validateShareAccess(
        rawInput.shareId,
        rawInput.id,
        {
          cookies: ctx.cookies,
          session: ctx.session?.userId
            ? { userId: ctx.session.userId }
            : undefined,
        }
      );
      if (!shareValidation.isValid) {
        throw new TRPCForbiddenError('You do not have access to this share');
      }

      // Fetch report
      const report = await getReportById(rawInput.id);
      if (!report) {
        throw new TRPCAccessError('Report not found');
      }

      return next({
        ctx: {
          report,
        },
      });
    }

    // Regular member access check
    if (!ctx.session?.userId) {
      throw new TRPCAccessError('Authentication required');
    }
    const access = await getProjectAccess({
      projectId: rawInput.projectId,
      userId: ctx.session.userId,
    });
    if (!access) {
      throw new TRPCForbiddenError('You do not have access to this project');
    }

    return next({
      ctx: {
        report: null,
      },
    });
  }
);

export const chartRouter = createTRPCRouter({
  projectCard: protectedProcedure
    .use(cacheMiddleware(60 * 5))
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(({ input: { projectId } }) => getProjectCard(projectId)),

  events: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(({ input: { projectId } }) => listChartEvents(projectId)),

  properties: protectedProcedure
    .input(
      z.object({
        event: z.string().optional(),
        projectId: z.string(),
      })
    )
    .query(({ input }) => listChartProperties(input)),

  values: protectedProcedure
    .input(
      z.object({
        event: z.string(),
        property: z.string(),
        projectId: z.string(),
      })
    )
    .query(({ input }) => getChartPropertyValues(input)),

  funnel: chartProcedure
    .use(cacher)
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      getFunnelChart(resolveReportInput(ctx.report, input))
    ),

  conversion: chartProcedure
    .use(cacher)
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      getConversionChart(resolveReportInput(ctx.report, input))
    ),

  sankey: protectedProcedure
    .input(zReportInput)
    .query(({ input }) => getSankeyChart(input)),

  chart: chartProcedure
    .use(cacher)
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      executeChart(resolveReportInput(ctx.report, input))
    ),

  aggregate: chartProcedure
    .use(cacher)
    .input(zShareableReportInput)
    .query(({ input, ctx }) =>
      executeAggregateChart(resolveReportInput(ctx.report, input))
    ),

  cohort: chartProcedure
    .use(cacher)
    .input(
      z.object({
        projectId: z.string(),
        firstEvent: z.array(z.string()).min(1),
        secondEvent: z.array(z.string()).min(1),
        criteria: zCriteria.default('on_or_after'),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        interval: zTimeInterval.default('day'),
        range: zRange,
        filters: z.array(zChartEventFilter).optional(),
        shareId: z.string().optional(),
        id: z.string().optional(),
      })
    )
    .query(({ input, ctx }) => getRetentionChart(ctx.report, input)),

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
    .query(({ input }) => getChartBucketProfiles(input)),

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
    .query(({ input }) => getFunnelStepProfiles(input)),
});

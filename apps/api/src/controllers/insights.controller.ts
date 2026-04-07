import { getDefaultIntervalByDates } from '@openpanel/constants';
import {
  eventBuffer,
  getChartStartEndDate,
  getSettingsForProject,
  overviewService,
} from '@openpanel/db';
import { zChartEventFilter, zRange } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export const zGetMetricsQuery = z.object({
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  range: zRange.default('7d'),
  filters: z.array(zChartEventFilter).default([]),
});

export async function getMetrics(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: z.infer<typeof zGetMetricsQuery>;
  }>,
  reply: FastifyReply,
) {
  const { timezone } = await getSettingsForProject(request.params.projectId);
  const { startDate, endDate } = getChartStartEndDate(request.query, timezone);
  reply.send(
    await overviewService.getMetrics({
      projectId: request.params.projectId,
      filters: request.query.filters,
      startDate,
      endDate,
      interval: getDefaultIntervalByDates(startDate, endDate) ?? 'day',
      timezone,
    }),
  );
}

export async function getLiveVisitors(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply,
) {
  reply.send({
    visitors: await eventBuffer.getActiveVisitorCount(request.params.projectId),
  });
}

export const zGetTopPagesQuery = z.object({
  filters: z.array(zChartEventFilter).default([]),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  range: zRange.default('7d'),
  cursor: z.number().optional(),
  limit: z.number().default(10),
});

export async function getPages(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: z.infer<typeof zGetTopPagesQuery>;
  }>,
  reply: FastifyReply,
) {
  const { timezone } = await getSettingsForProject(request.params.projectId);
  const { startDate, endDate } = getChartStartEndDate(request.query, timezone);
  return overviewService.getTopPages({
    projectId: request.params.projectId,
    filters: request.query.filters,
    startDate,
    endDate,
    timezone,
  });
}

export const overviewColumns = [
  'referrer',
  'referrer_name',
  'referrer_type',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'region',
  'country',
  'city',
  'device',
  'brand',
  'model',
  'browser',
  'browser_version',
  'os',
  'os_version',
] as const;

export type OverviewColumn = (typeof overviewColumns)[number];

// Querystring schema for the dynamic overview generic routes.
// `column` is injected from the route factory, not from the querystring.
export const zOverviewGenericQuerystring = z.object({
  filters: z.array(zChartEventFilter).default([]),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  range: zRange.default('7d'),
  cursor: z.number().optional(),
  limit: z.number().default(10),
});

export function getOverviewGeneric(column: OverviewColumn) {
  return async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Querystring: z.infer<typeof zOverviewGenericQuerystring>;
    }>,
    reply: FastifyReply,
  ) => {
    const { timezone } = await getSettingsForProject(request.params.projectId);
    const { startDate, endDate } = getChartStartEndDate(request.query, timezone);
    reply.send(
      await overviewService.getTopGeneric({
        column,
        projectId: request.params.projectId,
        filters: request.query.filters,
        startDate,
        endDate,
        timezone,
      }),
    );
  };
}

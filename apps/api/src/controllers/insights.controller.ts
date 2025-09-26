import { parseQueryString } from '@/utils/parse-zod-query-string';
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

const zGetMetricsQuery = z.object({
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  range: zRange.default('7d'),
  filters: z.array(zChartEventFilter).default([]),
});
// Website stats - main metrics overview
export async function getMetrics(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: z.infer<typeof zGetMetricsQuery>;
  }>,
  reply: FastifyReply,
) {
  const { timezone } = await getSettingsForProject(request.params.projectId);
  const parsed = zGetMetricsQuery.safeParse(parseQueryString(request.query));

  if (parsed.success === false) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid query parameters',
      details: parsed.error,
    });
  }

  const { startDate, endDate } = getChartStartEndDate(parsed.data, timezone);

  reply.send(
    await overviewService.getMetrics({
      projectId: request.params.projectId,
      filters: parsed.data.filters,
      startDate: startDate,
      endDate: endDate,
      interval: getDefaultIntervalByDates(startDate, endDate) ?? 'day',
      timezone,
    }),
  );
}

// Live visitors (real-time)
export async function getLiveVisitors(
  request: FastifyRequest<{
    Params: { projectId: string };
  }>,
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

// Page views with top pages
export async function getPages(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: z.infer<typeof zGetTopPagesQuery>;
  }>,
  reply: FastifyReply,
) {
  const { timezone } = await getSettingsForProject(request.params.projectId);
  const { startDate, endDate } = getChartStartEndDate(request.query, timezone);
  const parsed = zGetTopPagesQuery.safeParse(parseQueryString(request.query));

  if (parsed.success === false) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid query parameters',
      details: parsed.error,
    });
  }

  return overviewService.getTopPages({
    projectId: request.params.projectId,
    filters: parsed.data.filters,
    startDate: startDate,
    endDate: endDate,
    timezone,
    cursor: parsed.data.cursor,
    limit: Math.min(parsed.data.limit, 50),
  });
}

const zGetOverviewGenericQuery = z.object({
  filters: z.array(zChartEventFilter).default([]),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  range: zRange.default('7d'),
  column: z.enum([
    // Referrers
    'referrer',
    'referrer_name',
    'referrer_type',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    // Geo
    'region',
    'country',
    'city',
    // Device
    'device',
    'brand',
    'model',
    'browser',
    'browser_version',
    'os',
    'os_version',
  ]),
  cursor: z.number().optional(),
  limit: z.number().default(10),
});

export function getOverviewGeneric(
  column: z.infer<typeof zGetOverviewGenericQuery>['column'],
) {
  return async (
    request: FastifyRequest<{
      Params: { projectId: string; key: string };
      Querystring: z.infer<typeof zGetOverviewGenericQuery>;
    }>,
    reply: FastifyReply,
  ) => {
    const { timezone } = await getSettingsForProject(request.params.projectId);
    const { startDate, endDate } = getChartStartEndDate(
      request.query,
      timezone,
    );
    const parsed = zGetOverviewGenericQuery.safeParse({
      ...parseQueryString(request.query),
      column,
    });

    if (parsed.success === false) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: parsed.error,
      });
    }

    // TODO: Implement overview generic endpoint
    reply.send(
      await overviewService.getTopGeneric({
        column,
        projectId: request.params.projectId,
        filters: parsed.data.filters,
        startDate: startDate,
        endDate: endDate,
        timezone,
        cursor: parsed.data.cursor,
        limit: Math.min(parsed.data.limit, 50),
      }),
    );
  };
}

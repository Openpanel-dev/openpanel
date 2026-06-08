import { DateTime } from '@openpanel/common';
import type { GetEventListOptions } from '@openpanel/db';
import {
  ChartEngine,
  ClientType,
  db,
  getEventList,
  getEventsCount,
  getSettingsForProject,
} from '@openpanel/db';
import { zChartEvent, zChartEventFilter, zReport } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpError } from '@/utils/errors';

async function getProjectId(
  request: FastifyRequest<{
    Querystring: {
      project_id?: string;
      projectId?: string;
    };
  }>
) {
  let projectId = request.query.projectId || request.query.project_id;

  if (projectId) {
    if (
      request.client?.type === ClientType.read &&
      request.client?.projectId !== projectId
    ) {
      throw new HttpError('You do not have access to this project', {
        status: 403,
      });
    }

    const project = await db.project.findUnique({
      where: {
        organizationId: request.client?.organizationId,
        id: projectId,
      },
    });

    if (!project) {
      throw new HttpError('Project not found', {
        status: 404,
      });
    }
  }

  if (!projectId && request.client?.projectId) {
    projectId = request.client?.projectId;
  }

  if (!projectId) {
    throw new HttpError('project_id or projectId is required', {
      status: 400,
    });
  }

  return projectId;
}

const preprocessCommaSeparatedArray = (arg: unknown) => {
  if (arg == null) return undefined;
  if (Array.isArray(arg)) return arg;
  if (typeof arg === 'string')
    return arg.split(',').map((s) => s.trim()).filter(Boolean);
  return arg;
};

export const eventsScheme = z.object({
  project_id: z.string().optional(),
  projectId: z.string().optional(),
  profileId: z.string().optional(),
  event: z.union([z.string(), z.array(z.string())]).optional(),
  start: z.coerce.string().optional(),
  end: z.coerce.string().optional(),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(50),
  filters: z
    .preprocess((value) => {
      if (value == null || value === '') return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return undefined;
        }
      }
      return value;
    }, z.array(zChartEventFilter))
    .optional(),
  includes: z.preprocess(preprocessCommaSeparatedArray, z.array(z.string())).optional(),
  property_keys: z.preprocess(preprocessCommaSeparatedArray, z.array(z.string())).optional(),
});

export async function events(
  request: FastifyRequest<{
    Querystring: z.infer<typeof eventsScheme>;
  }>,
  reply: FastifyReply
) {
  const projectId = await getProjectId(request);
  const { limit, page: rawPage, event, start, end, profileId, includes, filters, property_keys } = request.query;
  const take = Math.max(Math.min(limit, 1000), 1);
  const cursor = Math.max(rawPage, 1) - 1;
  const options: GetEventListOptions = {
    projectId,
    events: (Array.isArray(event) ? event : [event]).filter((s): s is string => typeof s === 'string'),
    startDate: start ? new Date(start) : undefined,
    endDate: end ? new Date(end) : undefined,
    cursor,
    take,
    profileId,
    filters,
    propertyKeys: property_keys,
    select: {
      profile: false,
      meta: false,
      properties: true,
      ...includes?.reduce((acc, key) => ({ ...acc, [key]: true }), {}),
    },
  };

  const [data, totalCount] = await Promise.all([
    getEventList(options),
    getEventsCount(options),
  ]);

  reply.send({
    meta: {
      count: data.length,
      totalCount,
      pages: Math.ceil(totalCount / options.take),
      current: cursor + 1,
    },
    data,
  });
}

export const chartSchemeFull = zReport
  .pick({
    breakdowns: true,
    interval: true,
    range: true,
    previous: true,
    startDate: true,
    endDate: true,
  })
  .extend({
    project_id: z.string().optional(),
    projectId: z.string().optional(),
    series: z
      .array(
        z.object({
          name: z.string(),
          filters: zChartEvent.shape.filters.optional(),
          segment: zChartEvent.shape.segment.optional(),
          property: zChartEvent.shape.property.optional(),
        })
      )
      .optional(),
    // Backward compatibility - events will be migrated to series via preprocessing
    events: z
      .array(
        z.object({
          name: z.string(),
          filters: zChartEvent.shape.filters.optional(),
          segment: zChartEvent.shape.segment.optional(),
          property: zChartEvent.shape.property.optional(),
        })
      )
      .optional(),
  });

export async function charts(
  request: FastifyRequest<{
    Querystring: z.infer<typeof chartSchemeFull>;
  }>,
  reply: FastifyReply
) {
  const projectId = await getProjectId(request);
  const { timezone } = await getSettingsForProject(projectId);
  const { events, series, ...rest } = request.query;

  // Use series if available, otherwise fall back to events (backward compat)
  const eventSeries = (series ?? events ?? []).map((event: any) => ({
    ...event,
    type: event.type ?? 'event',
    segment: event.segment ?? 'event',
    filters: event.filters ?? [],
  }));

  return ChartEngine.execute({
    ...rest,
    startDate: rest.startDate
      ? DateTime.fromISO(rest.startDate)
          .setZone(timezone)
          .toFormat('yyyy-MM-dd HH:mm:ss')
      : undefined,
    endDate: rest.endDate
      ? DateTime.fromISO(rest.endDate)
          .setZone(timezone)
          .toFormat('yyyy-MM-dd HH:mm:ss')
      : undefined,
    projectId,
    series: eventSeries,
    chartType: 'linear',
    metric: 'sum',
  });
}

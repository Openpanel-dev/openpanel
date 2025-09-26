import { parseQueryString } from '@/utils/parse-zod-query-string';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { HttpError } from '@/utils/errors';
import { DateTime } from '@openpanel/common';
import type { GetEventListOptions } from '@openpanel/db';
import {
  ClientType,
  db,
  getEventList,
  getEventsCountCached,
  getSettingsForProject,
} from '@openpanel/db';
import { getChart } from '@openpanel/trpc/src/routers/chart.helpers';
import { zChartEvent, zChartInput } from '@openpanel/validation';
import { omit } from 'ramda';

async function getProjectId(
  request: FastifyRequest<{
    Querystring: {
      project_id?: string;
      projectId?: string;
    };
  }>,
  reply: FastifyReply,
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

const eventsScheme = z.object({
  project_id: z.string().optional(),
  projectId: z.string().optional(),
  profileId: z.string().optional(),
  event: z.union([z.string(), z.array(z.string())]).optional(),
  start: z.coerce.string().optional(),
  end: z.coerce.string().optional(),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(50),
  includes: z
    .preprocess(
      (arg) => (typeof arg === 'string' ? [arg] : arg),
      z.array(z.string()),
    )
    .optional(),
});

export async function events(
  request: FastifyRequest<{
    Querystring: z.infer<typeof eventsScheme>;
  }>,
  reply: FastifyReply,
) {
  const query = eventsScheme.safeParse(request.query);

  if (query.success === false) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid query parameters',
      details: query.error.errors,
    });
  }

  const projectId = await getProjectId(request, reply);
  const limit = query.data.limit;
  const page = Math.max(query.data.page, 1);
  const take = Math.max(Math.min(limit, 1000), 1);
  const cursor = page - 1;
  const options: GetEventListOptions = {
    projectId,
    events: (Array.isArray(query.data.event)
      ? query.data.event
      : [query.data.event]
    ).filter((s): s is string => typeof s === 'string'),
    startDate: query.data.start ? new Date(query.data.start) : undefined,
    endDate: query.data.end ? new Date(query.data.end) : undefined,
    cursor,
    take,
    profileId: query.data.profileId,
    select: {
      profile: false,
      meta: false,
      ...query.data.includes?.reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {},
      ),
    },
  };

  const [data, totalCount] = await Promise.all([
    getEventList(options),
    getEventsCountCached(omit(['cursor', 'take'], options)),
  ]);

  reply.send({
    meta: {
      count: data.length,
      totalCount: totalCount,
      pages: Math.ceil(totalCount / options.take),
      current: cursor + 1,
    },
    data,
  });
}

const chartSchemeFull = zChartInput
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
    events: z.array(
      z.object({
        name: z.string(),
        filters: zChartEvent.shape.filters.optional(),
        segment: zChartEvent.shape.segment.optional(),
        property: zChartEvent.shape.property.optional(),
      }),
    ),
  });

export async function charts(
  request: FastifyRequest<{
    Querystring: Record<string, string>;
  }>,
  reply: FastifyReply,
) {
  const query = chartSchemeFull.safeParse(parseQueryString(request.query));

  if (query.success === false) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid query parameters',
      details: query.error.errors,
    });
  }

  const projectId = await getProjectId(request, reply);
  const { timezone } = await getSettingsForProject(projectId);
  const { events, ...rest } = query.data;

  return getChart({
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
    events: events.map((event) => ({
      ...event,
      segment: event.segment ?? 'event',
      filters: event.filters ?? [],
    })),
    chartType: 'linear',
    metric: 'sum',
  });
}

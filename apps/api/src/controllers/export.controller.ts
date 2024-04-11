import type { FastifyReply, FastifyRequest } from 'fastify';

import type { GetEventListOptions } from '@openpanel/db';
import { ClientType, db, getEventList, getEventsCount } from '@openpanel/db';

type EventsQuery = {
  project_id?: string;
  event?: string | string[];
  start?: string;
  end?: string;
  page?: string;
};
export async function events(
  request: FastifyRequest<{
    Querystring: EventsQuery;
  }>,
  reply: FastifyReply
) {
  const query = request.query;

  if (query.project_id) {
    if (
      request.client?.type === ClientType.read &&
      request.client?.projectId !== query.project_id
    ) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'You do not have access to this project',
      });
      return;
    }

    const project = await db.project.findUnique({
      where: {
        organizationSlug: request.client?.organizationSlug,
        id: query.project_id,
      },
    });

    if (!project) {
      reply.status(404).send({
        error: 'Not Found',
        message: 'Project not found',
      });
      return;
    }
  }

  const projectId = query.project_id ?? request.client?.projectId;

  if (!projectId) {
    reply.status(400).send({
      error: 'Bad Request',
      message: 'project_id is required',
    });
    return;
  }

  const cursor = (parseInt(query.page || '1', 10) || 1) - 1;
  const options: GetEventListOptions = {
    projectId,
    events: (Array.isArray(query.event) ? query.event : [query.event]).filter(
      (s): s is string => typeof s === 'string'
    ),
    startDate: query.start ? new Date(query.start) : undefined,
    endDate: query.end ? new Date(query.end) : undefined,
    cursor,
    take: 50,
    meta: false,
    profile: true,
  };

  const [data, totalCount] = await Promise.all([
    getEventList(options),
    getEventsCount(options),
  ]);

  reply.send({
    meta: {
      // options,
      count: data.length,
      totalCount: totalCount,
      pages: Math.ceil(totalCount / options.take),
      current: cursor + 1,
    },
    data,
  });
}

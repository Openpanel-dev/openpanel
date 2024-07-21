import { validateClerkJwt } from '@/utils/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import superjson from 'superjson';
import type * as WebSocket from 'ws';

import { getSuperJson } from '@openpanel/common';
import type { IServiceEvent } from '@openpanel/db';
import {
  getEvents,
  getLiveVisitors,
  getProfileById,
  TABLE_NAMES,
  transformMinimalEvent,
} from '@openpanel/db';
import { getRedisCache, getRedisPub, getRedisSub } from '@openpanel/redis';
import { getProjectAccess } from '@openpanel/trpc';

export function getLiveEventInfo(key: string) {
  return key.split(':').slice(2) as [string, string];
}

export async function testVisitors(
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>,
  reply: FastifyReply
) {
  const events = await getEvents(
    `SELECT * FROM ${TABLE_NAMES.events} LIMIT 500`
  );
  const event = events[Math.floor(Math.random() * events.length)];
  if (!event) {
    return reply.status(404).send('No event found');
  }
  event.projectId = req.params.projectId;
  getRedisPub().publish('event:received', superjson.stringify(event));
  getRedisCache().set(
    `live:event:${event.projectId}:${Math.random() * 1000}`,
    '',
    'EX',
    10
  );
  reply.status(202).send(event);
}

export async function testEvents(
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>,
  reply: FastifyReply
) {
  const events = await getEvents(
    `SELECT * FROM ${TABLE_NAMES.events} LIMIT 500`
  );
  const event = events[Math.floor(Math.random() * events.length)];
  if (!event) {
    return reply.status(404).send('No event found');
  }
  getRedisPub().publish('event:saved', superjson.stringify(event));
  reply.status(202).send(event);
}

export function wsVisitors(
  connection: {
    socket: WebSocket;
  },
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>
) {
  const { params } = req;

  getRedisSub().subscribe('event:received');
  getRedisSub().psubscribe('__key*:expired');

  const message = (channel: string, message: string) => {
    if (channel === 'event:received') {
      const event = getSuperJson<IServiceEvent>(message);
      if (event?.projectId === params.projectId) {
        getLiveVisitors(params.projectId).then((count) => {
          connection.socket.send(String(count));
        });
      }
    }
  };
  const pmessage = (pattern: string, channel: string, message: string) => {
    const [projectId] = getLiveEventInfo(message);
    if (projectId && projectId === params.projectId) {
      getLiveVisitors(params.projectId).then((count) => {
        connection.socket.send(String(count));
      });
    }
  };

  getRedisSub().on('message', message);
  getRedisSub().on('pmessage', pmessage);

  connection.socket.on('close', () => {
    getRedisSub().unsubscribe('event:saved');
    getRedisSub().punsubscribe('__key*:expired');
    getRedisSub().off('message', message);
    getRedisSub().off('pmessage', pmessage);
  });
}

export async function wsProjectEvents(
  connection: {
    socket: WebSocket;
  },
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
    Querystring: {
      token?: string;
      type?: string;
    };
  }>
) {
  const { params, query } = req;
  const { token } = query;
  const type = query.type || 'saved';
  if (!['saved', 'received'].includes(type)) {
    connection.socket.send('Invalid type');
    connection.socket.close();
    return;
  }
  const subscribeToEvent = `event:${type}`;
  const decoded = validateClerkJwt(token);
  const userId = decoded?.sub;
  const access = await getProjectAccess({
    userId: userId!,
    projectId: params.projectId,
  });

  getRedisSub().subscribe(subscribeToEvent);

  const message = async (channel: string, message: string) => {
    const event = getSuperJson<IServiceEvent>(message);
    if (event?.projectId === params.projectId) {
      const profile = await getProfileById(event.profileId, event.projectId);
      connection.socket.send(
        superjson.stringify(
          access
            ? {
                ...event,
                profile,
              }
            : transformMinimalEvent(event)
        )
      );
    }
  };

  getRedisSub().on('message', message as any);

  connection.socket.on('close', () => {
    getRedisSub().unsubscribe(subscribeToEvent);
    getRedisSub().off('message', message as any);
  });
}

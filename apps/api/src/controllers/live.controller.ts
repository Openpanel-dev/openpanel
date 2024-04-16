import type { FastifyReply, FastifyRequest } from 'fastify';
import { escape } from 'sqlstring';
import superjson from 'superjson';
import type * as WebSocket from 'ws';

import { getSuperJson } from '@openpanel/common';
import type { IServiceCreateEventPayload } from '@openpanel/db';
import {
  getEvents,
  getLiveVisitors,
  transformMinimalEvent,
} from '@openpanel/db';
import { redis, redisPub, redisSub } from '@openpanel/redis';

export function getLiveEventInfo(key: string) {
  return key.split(':').slice(2) as [string, string];
}

export async function test(
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>,
  reply: FastifyReply
) {
  const events = await getEvents(
    `SELECT * FROM events WHERE project_id = ${escape(req.params.projectId)} AND name = 'screen_view' LIMIT 500`
  );
  const event = events[Math.floor(Math.random() * events.length)];
  if (!event) {
    return reply.status(404).send('No event found');
  }
  redisPub.publish('event', superjson.stringify(event));
  redis.set(
    `live:event:${event.projectId}:${Math.random() * 1000}`,
    '',
    'EX',
    10
  );
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

  redisSub.subscribe('event');
  redisSub.psubscribe('__key*:expired');

  const message = (channel: string, message: string) => {
    if (channel === 'event') {
      const event = getSuperJson<IServiceCreateEventPayload>(message);
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

  redisSub.on('message', message);
  redisSub.on('pmessage', pmessage);

  connection.socket.on('close', () => {
    redisSub.unsubscribe('event');
    redisSub.punsubscribe('__key*:expired');
    redisSub.off('message', message);
    redisSub.off('pmessage', pmessage);
  });
}

export function wsEvents(connection: { socket: WebSocket }) {
  redisSub.subscribe('event');

  const message = (channel: string, message: string) => {
    const event = getSuperJson<IServiceCreateEventPayload>(message);
    if (event) {
      connection.socket.send(superjson.stringify(transformMinimalEvent(event)));
    }
  };

  redisSub.on('message', message);

  connection.socket.on('close', () => {
    redisSub.unsubscribe('event');
    redisSub.off('message', message);
  });
}

export function wsProjectEvents(
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

  redisSub.subscribe('event');

  const message = (channel: string, message: string) => {
    const event = getSuperJson<IServiceCreateEventPayload>(message);
    if (event?.projectId === params.projectId) {
      connection.socket.send(superjson.stringify(transformMinimalEvent(event)));
    }
  };

  redisSub.on('message', message);

  connection.socket.on('close', () => {
    redisSub.unsubscribe('event');
    redisSub.off('message', message);
  });
}

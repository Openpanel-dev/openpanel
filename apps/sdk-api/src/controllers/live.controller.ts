import { combine } from '@/sse/combine';
import { redisMessageIterator } from '@/sse/redis-message-iterator';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { getSafeJson } from '@mixan/common';
import type { IServiceCreateEventPayload } from '@mixan/db';
import { chQuery, getEvents } from '@mixan/db';
import { redis, redisPub, redisSub } from '@mixan/redis';

async function getLiveCount(projectId: string) {
  const keys = await redis.keys(`live:event:${projectId}:*`);
  return keys.length;
}

function getLiveEventInfo(key: string) {
  return key.split(':').slice(2) as [string, string];
}

export async function test(request: FastifyRequest, reply: FastifyReply) {
  const [event] = await getEvents(
    `SELECT * FROM events LIMIT 1 OFFSET ${Math.floor(Math.random() * 1000)}`
  );
  if (!event) {
    return reply.status(404).send('No event found');
  }
  redisPub.publish('event', JSON.stringify(event));
  redis.set(`live:event:${event.projectId}:${event.profileId}`, '', 'EX', 10);
  reply.status(202).send('OK');
}

export function events(
  request: FastifyRequest<{
    Params: { projectId: string };
  }>,
  reply: FastifyReply
) {
  const reqProjectId = request.params.projectId;

  // Subscribe
  redisSub.subscribe('event');
  redisSub.psubscribe('__key*:*');
  const listeners: ((...args: any[]) => void)[] = [];

  const incomingEvents = redisMessageIterator({
    listenOn: 'message',
    async transformer(message) {
      const event = getSafeJson<IServiceCreateEventPayload>(message);
      if (event && event.projectId === reqProjectId) {
        return {
          visitors: await getLiveCount(event.projectId),
          event,
        };
      }
      return null;
    },
    registerListener(fn) {
      listeners.push(fn);
    },
  });

  const expiredEvents = redisMessageIterator({
    listenOn: 'pmessage',
    async transformer(message) {
      // message = live:event:${projectId}:${profileId}
      const [projectId] = getLiveEventInfo(message);
      if (projectId && projectId === reqProjectId) {
        return {
          visitors: await getLiveCount(projectId),
          event: null as null | IServiceCreateEventPayload,
        };
      }
      return null;
    },
    registerListener(fn) {
      listeners.push(fn);
    },
  });

  async function* consumeMessages() {
    for await (const result of combine([incomingEvents, expiredEvents])) {
      if (result.data) {
        yield {
          data: JSON.stringify(result.data),
        };
      }
    }
  }

  reply.sse(consumeMessages());

  reply.raw.on('close', () => {
    redisSub.unsubscribe('event');
    redisSub.punsubscribe('__key*:expired');
    listeners.forEach((listener) => redisSub.off('message', listener));
  });
}

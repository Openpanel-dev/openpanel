import { round } from '@openpanel/common';
import { TABLE_NAMES, chQuery, db } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type { FastifyReply, FastifyRequest } from 'fastify';

async function withTimings<T>(promise: Promise<T>) {
  const time = performance.now();
  try {
    const data = await promise;
    return {
      time: round(performance.now() - time, 2),
      data,
    } as const;
  } catch (e) {
    return null;
  }
}

export async function healthcheck(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (process.env.DISABLE_HEALTHCHECK) {
    return reply.status(200).send({
      ok: true,
    });
  }
  const redisRes = await withTimings(getRedisCache().ping());
  const dbRes = await withTimings(db.project.findFirst());
  const queueRes = await withTimings(eventsQueue.getCompleted());
  const chRes = await withTimings(
    chQuery(
      `SELECT * FROM ${TABLE_NAMES.events} WHERE created_at > now() - INTERVAL 10 MINUTE LIMIT 1`,
    ),
  );
  const status = redisRes && dbRes && queueRes && chRes ? 200 : 500;

  reply.status(status).send({
    redis: redisRes
      ? {
          ok: redisRes.data === 'PONG',
          time: `${redisRes.time}ms`,
        }
      : null,
    db: dbRes
      ? {
          ok: !!dbRes.data,
          time: `${dbRes.time}ms`,
        }
      : null,
    queue: queueRes
      ? {
          ok: !!queueRes.data,
          time: `${queueRes.time}ms`,
        }
      : null,
    ch: chRes
      ? {
          ok: !!chRes.data,
          time: `${chRes.time}ms`,
        }
      : null,
  });
}

export async function healthcheckQueue(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const count = await eventsQueue.getWaitingCount();
  if (count > 40) {
    reply.status(500).send({
      ok: false,
      count,
    });
  } else {
    reply.status(200).send({
      ok: true,
      count,
    });
  }
}

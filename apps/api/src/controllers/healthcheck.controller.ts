import { isShuttingDown } from '@/utils/graceful-shutdown';
import { chQuery, db } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import type { FastifyReply, FastifyRequest } from 'fastify';

// For docker compose healthcheck
export async function healthcheck(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const redisRes = await getRedisCache().ping();
    const dbRes = await db.project.findFirst();
    const chRes = await chQuery('SELECT 1');
    const status = redisRes && dbRes && chRes ? 200 : 503;

    reply.status(status).send({
      ready: status === 200,
      redis: redisRes === 'PONG',
      db: !!dbRes,
      ch: chRes && chRes.length > 0,
    });
  } catch (error) {
    return reply.status(503).send({
      ready: false,
      reason: 'dependencies not ready',
    });
  }
}

// Kubernetes - Liveness probe - returns 200 if process is alive
export async function liveness(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({ live: true });
}

// Kubernetes - Readiness probe - returns 200 only when accepting requests, 503 during shutdown
export async function readiness(request: FastifyRequest, reply: FastifyReply) {
  if (isShuttingDown()) {
    return reply.status(503).send({ ready: false, reason: 'shutting down' });
  }

  // Perform lightweight dependency checks for readiness
  const redisRes = await getRedisCache().ping();
  const dbRes = await db.project.findFirst();
  const chRes = await chQuery('SELECT 1');

  const isReady = redisRes && dbRes && chRes;

  if (!isReady) {
    return reply.status(503).send({
      ready: false,
      reason: 'dependencies not ready',
      redis: redisRes === 'PONG',
      db: !!dbRes,
      ch: chRes && chRes.length > 0,
    });
  }

  return reply.status(200).send({ ready: true });
}

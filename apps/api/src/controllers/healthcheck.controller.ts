import { tryCatch } from '@openpanel/common';
import { chQuery, db } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isShuttingDown } from '@/utils/graceful-shutdown';

export async function healthcheck(
  request: FastifyRequest,
  reply: FastifyReply
) {

  const [redisResult, dbResult, chResult] = await Promise.all([
    tryCatch(async () => (await getRedisCache().ping()) === 'PONG'),
    tryCatch(async () => !!(await db.$executeRaw`SELECT 1`)),
    tryCatch(async () => (await chQuery('SELECT 1')).length > 0),
  ]);

  const dependencies = {
    redis: redisResult.ok && redisResult.data,
    db: dbResult.ok && dbResult.data,
    ch: chResult.ok && chResult.data,
  };
  const dependencyErrors = {
    redis: redisResult.error?.message,
    db: dbResult.error?.message,
    ch: chResult.error?.message,
  };

  const failedDependencies = Object.entries(dependencies)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  const workingDependencies = Object.entries(dependencies)
    .filter(([, ok]) => ok)
    .map(([name]) => name);

  const status = failedDependencies.length === 0 ? 200 : 503;

  if (status === 200) {
    request.log.debug('healthcheck passed', {
      workingDependencies,
      failedDependencies,
      dependencies,
    });
  } else {
    request.log.warn('healthcheck failed', {
      workingDependencies,
      failedDependencies,
      dependencies,
      dependencyErrors,
    });
  }

  return reply.status(status).send({
    ready: status === 200,
    ...dependencies,
    failedDependencies,
    workingDependencies,
  });
}

// Kubernetes liveness — shallow, event loop only.
export async function liveness(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({ live: true });
}

// Kubernetes readiness — shallow + shutdown-aware. Dependency health lives on
// /healthcheck so a downstream blip cannot trigger mass pod restarts.
export async function readiness(_request: FastifyRequest, reply: FastifyReply) {
  if (isShuttingDown()) {
    return reply.status(503).send({ ready: false, reason: 'shutting down' });
  }

  return reply.status(200).send({ ready: true });
}

import { isShuttingDown } from '@/utils/graceful-shutdown';
import { chQuery, db } from '@openpanel/db';
import { getRedisCache } from '@openpanel/redis';
import type { FastifyReply, FastifyRequest } from 'fastify';
import v8 from 'node:v8';
import { createReadStream, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// For docker compose healthcheck
export async function healthcheck(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const redisRes = await getRedisCache().ping();
    const dbRes = await db.$executeRaw`SELECT 1`;
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

/**
 * Triggers `v8.writeHeapSnapshot()` and streams the resulting .heapsnapshot
 * file as a download. Open the downloaded file in Chrome DevTools → Memory
 * tab to walk the retainer chain and find which JS objects are holding the
 * heap.
 *
 * Producing the snapshot is expensive (stops the world briefly and writes
 * a multi-hundred-MB file). Call only when actively diagnosing.
 *
 * Auth: gated by ?token= matching HEAP_DUMP_TOKEN env. If the env is not
 * set, the endpoint is disabled (returns 404) so production pods don't
 * accidentally expose this.
 *
 * Usage:
 *   IP=$(kubectl get pod -n prod openpanel-api-XYZ -o jsonpath='{.status.podIP}')
 *   curl -OJ "http://$IP:3000/healthz/heap-snapshot?token=<HEAP_DUMP_TOKEN>"
 *   # Opens in Chrome DevTools: Memory → Load Profile → select downloaded file
 */
export async function heapSnapshot(
  request: FastifyRequest<{ Querystring: { token?: string } }>,
  reply: FastifyReply,
) {
  const expected = process.env.HEAP_DUMP_TOKEN;
  if (!expected) {
    return reply.status(404).send({ error: 'not found' });
  }
  if (request.query.token !== expected) {
    return reply.status(401).send({ error: 'unauthorized' });
  }

  const filename = `heap-${process.pid}-${Date.now()}.heapsnapshot`;
  const path = join(tmpdir(), filename);

  v8.writeHeapSnapshot(path);

  const size = statSync(path).size;
  const stream = createReadStream(path);

  // Clean up the file once the response has been fully sent (or aborted).
  stream.on('close', () => {
    try {
      unlinkSync(path);
    } catch {
      // best-effort cleanup
    }
  });

  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  reply.header('Content-Length', String(size));
  return reply.send(stream);
}

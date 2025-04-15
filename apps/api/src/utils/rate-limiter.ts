import { getRedisCache } from '@openpanel/redis';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export async function activateRateLimiter<T extends FastifyRequest>({
  fastify,
  max,
  timeWindow,
  keyGenerator,
}: {
  fastify: FastifyInstance;
  max: number;
  timeWindow?: string;
  keyGenerator?: (req: T) => string | undefined;
}) {
  await fastify.register(import('@fastify/rate-limit'), {
    max,
    timeWindow: timeWindow || '1 minute',
    errorResponseBuilder: (req, reply) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'You have exceeded the rate limit for this endpoint.',
      };
    },
    redis: getRedisCache(),
    keyGenerator(req) {
      if (keyGenerator) {
        const key = keyGenerator(req as T);
        if (key) {
          return key;
        }
      }
      return (req.headers['openpanel-client-id'] ||
        req.headers['x-real-ip'] ||
        req.headers['x-client-ip'] ||
        req.headers['x-forwarded-for']) as string;
    },
    onExceeded: (req, reply) => {
      req.log.warn('Rate limit exceeded', {
        clientId: req.headers['openpanel-client-id'],
      });
    },
  });
}

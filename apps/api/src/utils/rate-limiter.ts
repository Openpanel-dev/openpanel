import { getTrustedIpFromHeaders } from '@openpanel/common/server/get-client-ip';
import { getRedisCache } from '@openpanel/redis';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sanitizeUrl } from './sanitize-url';

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
    // In test mode use in-memory storage so tests don't need a running Redis
    redis: process.env.NODE_ENV !== 'test' ? getRedisCache() : undefined,
    keyGenerator(req) {
      if (keyGenerator) {
        const key = keyGenerator(req as T);
        if (key) {
          return key;
        }
      }
      // Only trusted headers - `x-client-ip` / `x-forwarded-for` are set by the
      // caller, so keying on them hands out a fresh bucket per request.
      return (
        (req.headers['openpanel-client-id'] as string) ||
        getTrustedIpFromHeaders(req.headers, req.socket?.remoteAddress).ip
      );
    },
    onExceeded: (req) => {
      const { ip, header } = getTrustedIpFromHeaders(
        req.headers,
        req.socket?.remoteAddress,
      );
      req.log.warn(
        {
          clientId: req.headers['openpanel-client-id'],
          ip,
          ipHeader: header,
          url: sanitizeUrl(req.url),
          userAgent: req.headers['user-agent'],
        },
        'rate limit exceeded',
      );
    },
  });
}

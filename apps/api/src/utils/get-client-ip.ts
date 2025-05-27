import type { FastifyRequest } from 'fastify';
import requestIp from 'request-ip';

const ignore = ['127.0.0.1', '::1'];

export function getClientIp(req: FastifyRequest) {
  return requestIp.getClientIp(req);
}

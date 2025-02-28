import type { FastifyRequest } from 'fastify';

export async function timestampHook(request: FastifyRequest) {
  request.timestamp = Date.now();
}

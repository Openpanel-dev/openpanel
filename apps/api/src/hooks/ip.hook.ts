import { getClientIp } from '@/utils/get-client-ip';
import type { FastifyRequest } from 'fastify';

export async function ipHook(request: FastifyRequest) {
  const ip = getClientIp(request);
  if (ip) {
    request.clientIp = ip;
  }
}

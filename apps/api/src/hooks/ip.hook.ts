import { getClientIpFromHeaders } from '@openpanel/common/server/get-client-ip';
import type { FastifyRequest } from 'fastify';

export async function ipHook(request: FastifyRequest) {
  const ip = getClientIpFromHeaders(request.headers);

  if (ip) {
    request.clientIp = ip;
  } else {
    request.clientIp = '';
  }
}

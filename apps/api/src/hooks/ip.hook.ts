import { getClientIpFromHeaders } from '@openpanel/common/server/get-client-ip';
import type { FastifyRequest } from 'fastify';

export async function ipHook(request: FastifyRequest) {
  const { ip, header } = getClientIpFromHeaders(request.headers);

  if (ip) {
    request.clientIp = ip;
    request.clientIpHeader = header;
  } else {
    request.clientIp = '';
    request.clientIpHeader = '';
  }
}

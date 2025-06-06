import { getClientIp } from '@/utils/get-client-ip';
import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';

export async function ipHook(request: FastifyRequest) {
  const ip = getClientIp(request);
  if (ip) {
    request.clientIp = ip;
  }
}

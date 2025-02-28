import { getClientIp } from '@/utils/parse-ip';
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

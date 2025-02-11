import { getClientIp } from '@/utils/parse-ip';
import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';

export function ipHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) {
  const ip = getClientIp(request);
  if (ip) {
    request.clientIp = ip;
  }
  done();
}

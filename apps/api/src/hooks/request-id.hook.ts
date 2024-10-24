import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';

export function requestIdHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) {
  if (!request.headers['request-id']) {
    request.headers['request-id'] = request.id;
  }
  done();
}

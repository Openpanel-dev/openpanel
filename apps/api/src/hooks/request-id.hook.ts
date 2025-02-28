import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';

export async function requestIdHook(request: FastifyRequest) {
  if (!request.headers['request-id']) {
    request.headers['request-id'] = request.id;
  }
}

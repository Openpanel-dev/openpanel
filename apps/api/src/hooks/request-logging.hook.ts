import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';
import { path, pick } from 'ramda';

const ignoreLog = ['/healthcheck', '/metrics', '/misc'];
const ignoreMethods = ['OPTIONS'];

const getTrpcInput = (
  request: FastifyRequest,
): Record<string, unknown> | undefined => {
  const input = path(['query', 'input'], request);
  try {
    return typeof input === 'string' ? JSON.parse(input).json : input;
  } catch (e) {
    return undefined;
  }
};

export function requestLoggingHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
) {
  if (ignoreMethods.includes(request.method)) {
    return done();
  }
  if (ignoreLog.some((path) => request.url.startsWith(path))) {
    return done();
  }
  if (request.url.includes('trpc')) {
    request.log.info('request done', {
      url: request.url.split('?')[0],
      method: request.method,
      input: getTrpcInput(request),
      elapsed: reply.elapsedTime,
    });
  } else {
    request.log.info('request done', {
      url: request.url,
      method: request.method,
      elapsed: reply.elapsedTime,
      headers: pick(
        [
          'openpanel-client-id',
          'openpanel-sdk-name',
          'openpanel-sdk-version',
          'user-agent',
        ],
        request.headers,
      ),
      body: request.body,
    });
  }
  done();
}

import type { FastifyReply, FastifyRequest } from 'fastify';
import { path, pick } from 'ramda';

const ignoreLog = ['/healthcheck', '/healthz', '/metrics', '/misc'];
const ignoreMethods = ['OPTIONS'];

const getTrpcInput = (
  request: FastifyRequest
): Record<string, unknown> | undefined => {
  const input = path<any>(['query', 'input'], request);
  try {
    return typeof input === 'string' ? JSON.parse(input).json : input;
  } catch {
    return undefined;
  }
};

export async function requestLoggingHook(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (ignoreMethods.includes(request.method)) {
    return;
  }
  if (ignoreLog.some((path) => request.url.startsWith(path))) {
    return;
  }
  if (request.url.includes('trpc')) {
    request.log.info(
      {
        url: request.url.split('?')[0],
        method: request.method,
        input: getTrpcInput(request),
        elapsed: reply.elapsedTime,
      },
      'request done',
    );
  } else {
    const payload: {
      url: string;
      method: string;
      elapsed: number;
      headers: Record<string, string | string[] | undefined>;
      body?: unknown;
    } = {
      url: request.url,
      method: request.method,
      elapsed: reply.elapsedTime,
      headers: pick(
        ['openpanel-client-id', 'openpanel-sdk-name', 'openpanel-sdk-version'],
        request.headers
      ),
    };

    if (payload.url.startsWith('/track')) {
      payload.body = request.body;
    }

    request.log.info(payload, 'request done');
  }
}

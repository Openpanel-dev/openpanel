import { DEFAULT_IP_HEADER_ORDER } from '@openpanel/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { path, pick } from 'ramda';

const ignoreLog = ['/healthcheck', '/healthz', '/metrics', '/misc'];
const ignoreMethods = ['OPTIONS'];

const getTrpcInput = (
  request: FastifyRequest,
): Record<string, unknown> | undefined => {
  const input = path<any>(['query', 'input'], request);
  try {
    return typeof input === 'string' ? JSON.parse(input).json : input;
  } catch (e) {
    return undefined;
  }
};

export async function requestLoggingHook(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (ignoreMethods.includes(request.method)) {
    return;
  }
  if (ignoreLog.some((path) => request.url.startsWith(path))) {
    return;
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
      clientIp: request.clientIp,
      clientIpHeader: request.clientIpHeader,
      headers: pick(
        [
          'openpanel-client-id',
          'openpanel-sdk-name',
          'openpanel-sdk-version',
          'user-agent',
          ...DEFAULT_IP_HEADER_ORDER,
        ],
        request.headers,
      ),
      body: request.body,
    });
  }
}

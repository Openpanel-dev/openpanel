import type { FastifyReply, FastifyRequest } from 'fastify';
import { path, pick } from 'ramda';
import { sanitizeUrl } from '../utils/sanitize-url';

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
      'request done'
    );
  } else {
    const payload: {
      url: string;
      method: string;
      elapsed: number;
      headers: Record<string, string | string[] | undefined>;
      body?: unknown;
      clientIp: string;
      clientIpHeader: string;
      userAgent: string;
    } = {
      url: sanitizeUrl(request.url),
      method: request.method,
      elapsed: reply.elapsedTime,
      headers: pick(
        ['openpanel-client-id', 'openpanel-sdk-name', 'openpanel-sdk-version'],
        request.headers
      ),
      clientIp: '',
      clientIpHeader: '',
      userAgent: '',
    };

    if (payload.url.startsWith('/track')) {
      payload.body = request.body;
    }

    const clientId = request.headers['openpanel-client-id'];
    if (
      process.env.ENABLE_VERBOSE_LOGGING?.split(',').includes(
        (Array.isArray(clientId) ? clientId[0] : clientId) ?? ''
      )
    ) {
      payload.clientIp = request.clientIp;
      payload.clientIpHeader = request.clientIpHeader;
      payload.userAgent = request.headers['user-agent'] ?? '';
    }

    request.log.info(payload, 'request done');
  }
}

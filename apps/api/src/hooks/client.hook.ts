import { SdkAuthError, validateSdkRequest } from '@/utils/auth';
import type {
  DeprecatedPostEventPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function clientHook(
  req: FastifyRequest<{
    Body: ITrackHandlerPayload | DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply,
) {
  try {
    const client = await validateSdkRequest(req);
    req.client = client;
  } catch (error) {
    if (error instanceof SdkAuthError) {
      req.log.warn({ err: error }, 'Invalid SDK request');
      return reply.status(401).send(error.message);
    }

    req.log.error({ err: error }, 'Invalid SDK request');
    return reply.status(500).send('Internal server error');
  }
}

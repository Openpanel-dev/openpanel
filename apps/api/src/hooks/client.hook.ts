import { SdkAuthError, validateSdkRequest } from '@/utils/auth';
import type { TrackHandlerPayload } from '@openpanel/sdk';
import type {
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';

export async function clientHook(
  req: FastifyRequest<{
    Body: TrackHandlerPayload;
  }>,
  reply: FastifyReply,
) {
  try {
    const client = await validateSdkRequest(req.headers);
    req.projectId = client.projectId;
    req.client = client;
  } catch (error) {
    if (error instanceof SdkAuthError) {
      req.log.warn(error, 'Invalid SDK request');
      return reply.status(401).send(error.message);
    }

    req.log.error(error, 'Invalid SDK request');
    return reply.status(500).send('Internal server error');
  }
}

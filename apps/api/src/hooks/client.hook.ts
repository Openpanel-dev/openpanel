import { SdkAuthError, validateSdkRequest } from '@/utils/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function clientHook(req: FastifyRequest, reply: FastifyReply) {
  try {
    const client = await validateSdkRequest(req);
    req.client = client;
  } catch (error) {
    if (error instanceof SdkAuthError) {
      return reply.status(401).send(error.message);
    }

    return reply.status(500).send('Internal server error');
  }
}

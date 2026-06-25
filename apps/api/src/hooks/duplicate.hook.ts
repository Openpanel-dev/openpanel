import type {
  DeprecatedPostEventPayload,
  ITrackBatchHandlerPayload,
  ITrackHandlerPayload,
} from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isDuplicatedEvent } from '@/utils/deduplicate';

type TrackBody = ITrackHandlerPayload | ITrackBatchHandlerPayload;

export async function duplicateHook(
  req: FastifyRequest<{
    Body: TrackBody | DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply
) {
  const ip = req.clientIp;
  const origin = req.headers.origin;
  const clientId = req.headers['openpanel-client-id'];
  const body = req?.body;
  const isTrackPayload = getIsTrackPayload(req);
  // Replays stream chunked payloads and offline-first SDKs retry whole
  // batches — neither should be dropped by the 100 ms body-hash dedup.
  const skipDedup =
    isTrackPayload &&
    (req.body.type === 'replay' || req.body.type === 'batch');
  const shouldCheck = ip && origin && clientId && !skipDedup;
  const isDuplicate = shouldCheck
    ? await isDuplicatedEvent({
        ip,
        origin,
        payload: body,
        projectId: clientId as string,
      })
    : false;

  if (isDuplicate) {
    return reply.status(200).send('Duplicate event');
  }
}

function getIsTrackPayload(
  req: FastifyRequest<{
    Body: TrackBody | DeprecatedPostEventPayload;
  }>
): req is FastifyRequest<{
  Body: TrackBody;
}> {
  if (req.method !== 'POST') {
    return false;
  }

  if (!req.body) {
    return false;
  }

  if (typeof req.body !== 'object' || Array.isArray(req.body)) {
    return false;
  }

  return 'type' in req.body;
}

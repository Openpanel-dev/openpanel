import {
  fetchDeviceIdentity,
  ingestTrack,
  type TrackOutcome,
} from '@openpanel/core';
import { groupBuffer, replayBuffer, sessionBuffer } from '@openpanel/db';
import { produceIncomingEvent } from '@openpanel/queue';
import type { ITrackHandlerPayload } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '@/utils/errors';

// Dissolved into @openpanel/core's ingest module (M8-002): the whole pipeline
// — context building, the seven payload handlers, device/session resolution
// and the Kafka produce — moved to ingest.service.ts. These controllers stay
// (DELEGATE PATTERN) as the live Fastify handlers: they resolve
// `request.client`, hand the pipeline its transport, and translate the
// outcome back into the exact replies and `HttpError`s V1 produced.
//
// The producer is passed in rather than imported by core: @openpanel/queue
// imports @openpanel/core for its logger, so core cannot import it back
// (M8-003 moves the producer into core).

const ingestBuffers = {
  session: sessionBuffer,
  replay: replayBuffer,
  group: groupBuffer,
};

function replyToOutcome(outcome: TrackOutcome, reply: FastifyReply) {
  switch (outcome.status) {
    case 'ok':
      return reply.status(200).send({
        deviceId: outcome.deviceId,
        sessionId: outcome.sessionId,
      });
    case 'alias-not-supported':
      return reply.status(400).send({
        status: 400,
        error: 'Bad Request',
        message: 'Alias is not supported',
      });
    case 'invalid-type':
      return reply.status(400).send({
        status: 400,
        error: 'Bad Request',
        message: 'Invalid type',
      });
    case 'missing-project-id':
      throw new HttpError('Missing projectId', { status: 400 });
    case 'replay-missing-session-id':
      throw new HttpError('Session ID is required for replay', { status: 400 });
    case 'profile-not-found':
      throw new HttpError('Profile not found', { status: 404 });
    default:
      throw new HttpError('Property value is not a number', { status: 400 });
  }
}

export async function handler(
  request: FastifyRequest<{
    Body: ITrackHandlerPayload;
  }>,
  reply: FastifyReply
) {
  const outcome = await ingestTrack(
    {
      projectId: request.client?.projectId,
      clientIp: request.clientIp,
      headers: request.headers,
      clientSecretAuth: request.clientSecretAuth ?? false,
      timestamp: request.timestamp,
      body: request.body,
    },
    { buffers: ingestBuffers, produceIncomingEvent }
  );

  return replyToOutcome(outcome, reply);
}

export async function fetchDeviceId(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const identity = await fetchDeviceIdentity(
    {
      projectId: request.client?.projectId,
      clientIp: request.clientIp,
      headers: request.headers,
    },
    { session: sessionBuffer },
    request.log
  );

  switch (identity.status) {
    case 'missing-project-id':
      return reply.status(400).send('No projectId');
    case 'missing-ip':
      return reply.status(400).send('Missing ip address');
    case 'missing-user-agent':
      return reply.status(400).send('Missing header: user-agent');
    default:
      return reply.status(200).send({
        deviceId: identity.deviceId,
        sessionId: identity.sessionId,
        message: identity.message,
      });
  }
}

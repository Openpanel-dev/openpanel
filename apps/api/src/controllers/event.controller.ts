import { generateId } from '@openpanel/common';
import { getAsnInfo, getGeoLocation, parseUserAgent } from '@openpanel/core';
import { getSalts } from '@openpanel/db';
import {
  type EventsQueuePayloadIncomingEvent,
  produceIncomingEvent,
} from '@openpanel/queue';
import type { DeprecatedPostEventPayload } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { v4 as uuid } from 'uuid';
import { getStringHeaders, getTimestamp } from './track.controller';
import { applyBotSuspicion } from '@/bots/suspicion';
import { getDeviceId } from '@/utils/ids';

export async function postEvent(
  request: FastifyRequest<{
    Body: DeprecatedPostEventPayload;
  }>,
  reply: FastifyReply
) {
  const { timestamp, isTimestampFromThePast } = getTimestamp(
    request.timestamp,
    request.body
  );
  const ip = request.clientIp;
  const ua = request.headers['user-agent'] ?? 'unknown/1.0';
  const projectId = request.client?.projectId;
  const headers = getStringHeaders(request.headers);

  if (!projectId) {
    reply.status(400).send('missing origin');
    return;
  }

  const [salts, geo, asnInfo] = await Promise.all([
    getSalts(),
    getGeoLocation(ip),
    getAsnInfo(ip),
  ]);
  const { deviceId, sessionId } = await getDeviceId({
    projectId,
    ip,
    ua,
    salts,
  });

  const uaInfo = parseUserAgent(ua, request.body?.properties);
  // Mark (never block) likely bot traffic with __bot / __bot_reasons props.
  // This deprecated route has no body schema, so body can be null/undefined.
  if (request.body) {
    request.body.properties = applyBotSuspicion(request.body.properties, {
      asnInfo,
      headers: request.headers,
      clientSecretAuth: request.clientSecretAuth,
      isServer: uaInfo.isServer,
    });
  }
  const groupId = uaInfo.isServer
    ? `${projectId}:${request.body?.profileId ?? generateId()}`
    : deviceId;
  const queueData: EventsQueuePayloadIncomingEvent['payload'] = {
    // See track.controller: the producer mints the event id.
    id: uuid(),
    projectId,
    headers,
    event: {
      ...request.body,
      timestamp,
      isTimestampFromThePast,
    },
    uaInfo,
    geo,
    deviceId,
    sessionId: sessionId ?? '',
  };

  await produceIncomingEvent(queueData, groupId);

  reply.status(202).send('ok');
}

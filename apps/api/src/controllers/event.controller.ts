import { generateId } from '@openpanel/common';
import { parseUserAgent } from '@openpanel/common/server';
import { getSalts } from '@openpanel/db';
import { getGeoLocation } from '@openpanel/geo';
import {
  type EventsQueuePayloadIncomingEvent,
  getEventsGroupQueueShard,
  produceIncomingEvent,
  shouldUseKafka,
} from '@openpanel/queue';
import type { DeprecatedPostEventPayload } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getStringHeaders, getTimestamp } from './track.controller';
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

  const [salts, geo] = await Promise.all([getSalts(), getGeoLocation(ip)]);
  const { deviceId, sessionId } = await getDeviceId({
    projectId,
    ip,
    ua,
    salts,
  });

  const uaInfo = parseUserAgent(ua, request.body?.properties);
  const groupId = uaInfo.isServer
    ? `${projectId}:${request.body?.profileId ?? generateId()}`
    : deviceId;
  const queueData: EventsQueuePayloadIncomingEvent['payload'] = {
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

  if (shouldUseKafka()) {
    await produceIncomingEvent(queueData, groupId);
  } else {
    await getEventsGroupQueueShard(groupId).add({
      orderMs: new Date(timestamp).getTime(),
      data: queueData,
      groupId,
    });
  }

  reply.status(202).send('ok');
}
